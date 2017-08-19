let express = require('express');
let request = require('request');
let cookieSession = require('cookie-session')
let bodyParser = require('body-parser')

let configurator = require('./configurator')
let templateStore = require('./templates')

configurator.require_values([
    'SLACK_CLIENT_ID',
    'SLACK_CLIENT_SECRET',
    'SF_CLIENT_ID',
    'SF_CLIENT_SECRET',
    'SF_REDIRECT_BENIFIELD'
], configurator.standard_env_paths())

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

var salesforce = require('./app')(app, configurator)

// Again, we define a port we want to listen to
const PORT=4390;

// Lets start our server
app.listen(PORT, function () {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Example app listening on port " + PORT);
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


app.post('/commands', function(req, res) {
    res.json(templateStore.menu('help'))
});

function listCommand(sobject, team_id, user_id, callback) {
    salesforce.getSFConnection(team_id, user_id, (err, conn) => {
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

function recordDetail(team_id, user_id, sobject, record_id, callback) {
    salesforce.getSFConnection(team_id, user_id, (err, conn) => {
        if (err) {return callback(null, {error: err})}

        conn.sobject(sobject).retrieve(record_id, function(err, record) {
            if (err) { return callback(null, {error: err}) }

            console.log("Got record back")
            console.log(record);
            var att = {title: record.Name, text: record.Id, fields: []}
            for (var k in record) {
                att.fields.push({title: k, value: record[k], short:true})
            }
            var obj = {text: record.Name, replace_original: false, attachments: [att]}
            callback(null, obj)
        });        
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
            console.log("Posting json: ", json)
            request.post(payload.response_url,
                {json: json}, function(err) {
                    console.log("Request returned ", err)
                })
        }
    }

    if (action.value.match(/back$/)) {
        var menu = templateStore.menu(payload.callback_id).backmenu
        return res.send(templateStore.menu(menu))
    } else if (action.value == "Details") {
        var pair = payload.callback_id.split(",")
        recordDetail(payload.team.id, payload.user.id, pair[0], pair[1], finishCB)
        res.send(`Looking up record: ${pair[0]} with id ${pair[1]}`)
        return
    } else {
        switch (payload.callback_id) {
            case 'List records':
                listCommand(action.value, payload.team.id, payload.user.id, finishCB)
                res.send("Working on it")
        }
    }

    if (templateStore.hasMenu(action.value)) {
        res.send(templateStore.menu(action.value))
    } else {
        res.send(`Unknown menu requested '${action.value}'`)
    }

})

module.exports = {
    listCommand: listCommand,
    formatResults: formatResults,
    _test: _test
}
