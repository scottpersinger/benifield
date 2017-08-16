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
        return USERS[team_id]
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

// Store our app's ID and Secret. These we got from Step 1. 
// For this tutorial, we'll keep your API credentials right here. But for an actual app, you'll want to  store them securely in environment variables. 
var clientId = configurator.SLACK_CLIENT_ID;
var clientSecret = configurator.SLACK_CLIENT_SECRET;

// Instantiates Express and assigns our app variable to it
var app = express();

app.use(bodyParser.urlencoded({extended:false}))
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

function listCommand(conn, args, callback) {
    switch (args[0]) {
        case undefined:
            callback("list <users|tables>, list table <table name>")
            break
        case 'users':
            conn.query("select Id, Name, Email from User", function(err, result) {
                var fr = formatResults(err, result.records, ['Name', 'Email'])
                callback(fr)
            })
            break
        case 'tables':
            conn.describeGlobal(function(err, result) {
                callback(formatResults(err, result.sobjects, ['name']))
            })
            break
        default:
            callback("unknown options")
    }
}

module.exports = {
    listCommand: listCommand,
    formatResults: formatResults
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

// Route the endpoint that our slash command will point to and send back a simple response to indicate that ngrok is working
app.post('/commands', function(req, res) {
    var q = req.body.text
    var cmds = q.split(/\s+/)
    if (cmds.length > 0) {
        getUser(req.body.team_id, (err, user) => {
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
            var finishCB = (result) => {
                request.post(req.body.response_url,
                    {json: {text: result}})
            }

            switch (cmd) {
                case 'list':
                    listCommand(conn, args, finishCB)
                case 'search':
                    searchCommand(conn, args, finishCB)          
            }
        })

    } else {
        res.send("hi")
    }
    return

});
