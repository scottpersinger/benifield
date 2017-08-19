let jsforce = require('jsforce')
let AWS = require('aws-sdk');

module.exports = function(app, configurator) {

AWS.config.update({region:'us-east-1'});
let dynamo = new AWS.DynamoDB.DocumentClient();
let s3 = new AWS.S3()
let USERS = {}
let USERS_TABLE = 'benifield-users'


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

return {
	getSFConnection: getSFConnection
}

}
