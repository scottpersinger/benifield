var session = require('express-session')
var express = require('express')

var app = express()

app.set('trust proxy', 1) // trust first proxy

app.use(session({
  secret: '9s9JAJAH886H',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}))

app.get('/', function (req, res, next) {
  // Update views
  console.log(req.headers)
  req.session.views = (req.session.views || 0) + 1

  // Write response
  res.end(req.session.views + ' views')
})

app.listen(4390)

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
