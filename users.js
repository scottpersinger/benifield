let USERS = {}

module.exports = function(knex) {
    let makeUser = (slackInfo, salesforceInfo) => {
        return {team_id: slackInfo.team_id,
                user_id: slackInfo.installer_user_id,
                salesforce: salesforceInfo,
                slack: slackInfo}
    }

    let saveUser = (slackInfo, salesforceInfo) => {
        var user = makeUser(slackInfo, salesforceInfo)
        knex('users').insert({
        	slack_user_id: user.user_id,
        	slack_team_id: user.team_id,
        	sf_org_id: user.salesforce.organization_id,
        	slack: user.slack,
            salesforce: user.salesforce
        }).catch((err) => {
        	console.log("DB ERROR saving user: ", err)
        })

        USERS[user.user_id] = user
    }

    let getUser = (user_id, team_id, callback) => {
        if (USERS[user_id]) {
            callback(null, USERS[user_id])
        } else {
        	knex.select().table('users').where({slack_user_id: user_id, slack_team_id: team_id})
        	.then(function(rows) {
        		USERS[user_id] = makeUser(rows[0].slack, rows[0].salesforce)
        		callback(null, rows[0])
        	}).catch(function(err) {
        		callback(err, null)
        	})
        }
    }

    let updateAccessToken = (user, access_token) => {
        user.salesforce.access_token = access_token
        knex('users')
            .where({slack_user_id: user.slack_user_id, slack_team_id: user.slack_team_id})
            .update({salesforce: user.salesforce})
            .catch((err) => {
                console.error(`Updating updating acccess token for ${user.user_id}: `, err);

            })
    }


    return {
        saveUser: saveUser,
        getUser: getUser,
        updateAccessToken: updateAccessToken
    }
}
