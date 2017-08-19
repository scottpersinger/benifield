let express = require('express');
let request = require('request');
let cookieSession = require('cookie-session')
let bodyParser = require('body-parser')
let jsforce = require('jsforce')

let AWS = require('aws-sdk');
AWS.config.update({region:'us-east-1'});
let dynamo = new AWS.DynamoDB.DocumentClient();
let s3 = new AWS.S3()
let USERS = {}
let USERS_TABLE = 'benifield-users'

let configurator = require('./configurator')
let templateStore = require('./templates')

configurator.require_values([
    'SLACK_CLIENT_ID',
    'SLACK_CLIENT_SECRET',
    'SF_CLIENT_ID',
    'SF_CLIENT_SECRET',
    'SF_REDIRECT_BENIFIELD'
], configurator.standard_env_paths())

let saveUser = (userInfo) => {
    console.log("Saving: ", userInfo)
    USERS[userInfo.team_id] = userInfo
    userInfo.project_id = "1"
    var params = {
        TableName: USERS_TABLE, Item: userInfo
    }
    dynamo.put(params, function(err, data) {
        if (err) {
            console.error("Dynamo error: ", err);
        }
    })
}

let updateAccessToken = (user, access_token) => {
    user.salesforce.access_token = access_token
    dynamo.update({
        TableName: USERS_TABLE, 
        Key: {team_id: user.team_id}, 
        UpdateExpression: "SET #SF = :sf",
        ExpressionAttributeNames: {"#SF": "salesforce"},
        ExpressionAttributeValues: {":sf": user.salesforce}
    }, function(err, data) {
        if (err) {
            console.error("Dynamo error: ", err);
        }
    })

}
let getUser = (team_id, callback) => {
    if (USERS[team_id]) {
        callback(null, USERS[team_id])
    } else {
        dynamo.get({TableName: USERS_TABLE, Key: {team_id: team_id}}, function(err, data) {
            if (err) {
                console.log("Dynamo error reading app target: ", err)
                callback(err, null)
            } else {
                USERS[team_id] = data.Item
                callback(null, data.Item)
            }
        })
    }
}

let getSFConnection = (team_id, user_id, callback) => {
    getUser(team_id, (err, user) => {
        console.log("Got user")
        var conn = new jsforce.Connection({
            oauth2 : sfoauth,
            instanceUrl: user.salesforce.instance_url,
            accessToken: user.salesforce.access_token,
            refreshToken: user.salesforce.refresh_token
        });
        conn.on("refresh", function(accessToken) {
            updateAccessToken(user, accessToken)
        })
        callback(null, conn)
    })
}

// Store our app's ID and Secret. These we got from Step 1. 
// For this tutorial, we'll keep your API credentials right here. But for an actual app, you'll want to  store them securely in environment variables. 
var clientId = configurator.SLACK_CLIENT_ID;
var clientSecret = configurator.SLACK_CLIENT_SECRET;

// Instantiates Express and assigns our app variable to it
var app = express();

app.use(bodyParser.urlencoded({extended:false}))
app.use(bodyParser.json())
app.set('view engine', 'ejs')
app.set('views', './views')
app.use(cookieSession({name:'session', keys: [clientSecret]}))

// Again, we define a port we want to listen to
const PORT=4390;

// Lets start our server
app.listen(PORT, function () {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Example app listening on port " + PORT);
});


// This route handles GET requests to our root ngrok address and responds with the same "Ngrok is working message" we used before
app.get('/', function(req, res) {
    console.log(Object.keys(req.session.slack || {}))
    res.render('index', { team_name: req.session.slack ? req.session.slack.team_name : null})
})

var sfoauth = new jsforce.OAuth2({
  // you can change loginUrl to connect to sandbox or prerelease env.
  // loginUrl : 'https://test.salesforce.com',
  clientId : configurator.SF_CLIENT_ID,
  clientSecret : configurator.SF_CLIENT_SECRET,
  redirectUri : configurator.get('SF_REDIRECT_BENIFIELD')
});

app.get('/sf/oauth2', function(req, res) {
  res.redirect(sfoauth.getAuthorizationUrl({prompt: "select_account"}));
});

app.get('/sf/callback', function(req, res) {
    var conn = new jsforce.Connection({ oauth2 : sfoauth });
    var code = req.param('code');
    conn.authorize(code, function(err, userInfo) {
        if (err) { return console.error(err); }
        // Now you can get the access token, refresh token, and instance URL information.
        // Save them to establish connection next time.
        console.log(conn.accessToken);
        console.log(conn.refreshToken);
        console.log(conn.instanceUrl);
        console.log("User ID: " + userInfo.id);
        console.log("Org ID: " + userInfo.organizationId);
        conn.identity(function(err, res) {
            saveUser({team_id: req.session.slack.team_id, 
                      salesforce: {username: res.username, idurl: res.id, instance_url: conn.instanceUrl, 
                            access_token: conn.accessToken, refresh_token: conn.refreshToken,
                            organization_id: userInfo.organizationId, user_id: userInfo.id},
                      slack: req.session.slack})
        })
        // ...
        res.send('<html><body><h2>success</h2><a href="/">Home</a></body></html'); // or your desired response
  });

})

// This route handles get request to a /oauth endpoint. We'll use this endpoint for handling the logic of the Slack oAuth process behind our app.
app.get('/oauth', function(req, res) {
    // When a user authorizes an app, a code query parameter is passed on the oAuth endpoint. If that code is not there, we respond with an error message
    if (!req.query.code) {
        res.status(500);
        res.send({"Error": "Looks like we're not getting code."});
        console.log("Looks like we're not getting code.");
    } else {
        // If it's there...

        // We'll do a GET call to Slack's `oauth.access` endpoint, passing our app's client ID, client secret, and the code we just got as query parameters.
        console.log("Exchanging code: ", req.query.code)
        request.post('https://slack.com/api/oauth.token',
            {form: {
                code: req.query.code, 
                client_id: clientId, 
                client_secret: clientSecret
            }}
        , function (error, response, body) {
            if (error) {
                console.log(error);
            } else {
                body = JSON.parse(body)
                console.log(body)
                req.session.slack = body
                res.render('index', {team_name: body.team_name})
            }
        })
    }
});

function formatResults(err, result, fields) {
    if (err) {
        return "Error: " + err;
    } else {
        return result.map((record) => {
            return fields.map((field) => {return record[field]}).join("\t")
        }).join("\n")
    }
}

function _test(callback) {
    getUser('T6NG5M70T', function(err, user) {
        var conn = new jsforce.Connection({
            oauth2 : sfoauth,
            instanceUrl: user.salesforce.instance_url,
            accessToken: user.salesforce.access_token,
            refreshToken: user.salesforce.refresh_token
        });
        callback(user, conn)
    })
}

function searchCommand(conn, args, callback) {
    var q = args.join(" ")
    conn.search(`FIND {${q}*} IN ALL FIELDS RETURNING ` +
            "Account(Id, Name), Contact(Id, Name), Lead(Id, Name), Opportunity(Id, Name)",
        function(err, result) {
            callback(formatResults(err, result.searchRecords, ['Id', 'Name']))
        }
    );
}

function button(t, text) {
    return {name: t, text: text, type: "button", value: text.toLowerCase().replace(" ", "-")}
}

var t1 = "topic"
var $menus = {
    help: {text: "Pick an action",
            attachments: [{
                "text": "",
                "callback_id": "help",
                "actions": [
                    button(t1, "List records"),
                    button(t1, "Search records"),
                    button(t1, "Edit records"),
                    button(t1, "Chatter")
                ]
            }]
        },
    "list-records":
        {text: "Browse records from different tables",
         backmenu: "help",
        attachments: [{
            "text": "",
            "callback_id": "list",
            actions: [
                button(t1, "Users"),
                button(t1, "Accounts"),
                button(t1, "Contacts"),
                button(t1, "Leads"),
                button(t1, "<< back")               
            ]
        }]
    }
}


function helpCommand(callback) {
    callback(templateStore.menu('help'))
}

// Route the endpoint that our slash command will point to and send back a simple response to indicate that ngrok is working
app.post('/commands', function(req, res) {
    var q = req.body.text
    var cmds = q.split(/\s+/)
    console.log(req.body)

    var finishCB = (result, json) => {
        if (result) {
            request.post(req.body.response_url,
                {json: {text: result}})
        } else {
            console.log("Posting json")
            request.post(req.body.response_url,
                {json: json}, function(err) {
                    console.log("Request returned ", err)
                })
        }
    }

    if (cmds.length > 0 && cmds[0]) {
        console.log(`Running command '${cmds[0]}'`)
        if (cmds[0] === 'help') {
            return helpCommand((json) => res.send(json))
        }
        console.log("Getting user")
        getUser(req.body.team_id, (err, user) => {
            console.log("Got user")
            res.send("Ok, working on it...")
            var conn = new jsforce.Connection({
                oauth2 : sfoauth,
                instanceUrl: user.salesforce.instance_url,
                accessToken: user.salesforce.access_token,
                refreshToken: user.salesforce.refresh_token
            });
            conn.on("refresh", function(accessToken) {
                updateAccessToken(user, accessToken)
            })

            console.log("Starting SF search")
            cmd = cmds[0].toLowerCase()
            var args = cmds.splice(1)

            switch (cmd) {
                case 'list':
                    listCommand(conn, args, finishCB)
                    break
                case 'search':
                    searchCommand(conn, args, finishCB)
                    break
            }
        })

    } else {
        return helpCommand((json) => res.send(json))
    }
});

function listCommand(sobject, team_id, user_id, callback) {
    getSFConnection(team_id, user_id, (err, conn) => {
        sobject = sobject.replace(/s$/,'').toLowerCase()
        var template = templateStore.templates[sobject]
        if (!template) {
            return callback(`Error, no template for '${sobject}'`)
        }
        var fieldList = templateStore.parseTemplateFields(template).join(",")
        var cmd = `select ${fieldList} from ${sobject} order by createddate limit 10`
        console.log(cmd)
        conn.query(cmd, function(err, result) {
            if (err) {
                return callback("Error: " + err)
            }
            var attachments = []
            result.records.forEach((r) => {attachments.push(templateStore.evalTemplate(template, sobject, r))})
            var result = {text: `${result.records.length} records`, attachments: attachments}
            console.log(result)
            callback(null, result)
        })
    })
}


app.post('/buttons', function(req, res) {
    var payload = JSON.parse(req.body.payload)
    console.log(payload)
    var action = payload.actions[0]

    var finishCB = (result, json) => {
        console.log(payload)
        if (result) {
            request.post(payload.response_url,
                {json: {text: result}})
        } else {
            console.log("Posting json")
            request.post(payload.response_url,
                {json: json}, function(err) {
                    console.log("Request returned ", err)
                })
        }
    }

    if (action.value.match(/back$/)) {
        var menu = templateStore.menu(payload.callback_id).backmenu
        res.send(templateStore.menu(menu))
    } else {
        switch (payload.callback_id) {
            case 'list':
                listCommand(action.value, payload.team.id, payload.user.id, finishCB)
                break
        }
    }

    if (templateStore.hasMenu(action.value)) {
        res.send(templateStore.menu(action.value))
    } else {
        res.send("")
        //{"response_type": "ephemeral", "replace_original": true, "text": "Working on it"})
    }

})

module.exports = {
    listCommand: listCommand,
    formatResults: formatResults,
    getUser: getUser,
    _test: _test
}
