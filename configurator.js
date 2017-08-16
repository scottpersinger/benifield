let fs = require('fs')
let path = require('path')
let {execSync} = require('child_process')

var env_dicts = {}

function loadEnv(envPath, callback) {
	if (fs.existsSync(envPath)) {
		console.log(`[config from ${envPath}]`)

		var output = execSync(`source ${envPath}; env`, {encoding:'utf8'})
		var dict = {}
		output.match(/\S+=\S+/g).forEach((pair) => {
			var tuple = pair.match(/(\S+)=(\S+)/)
			if (tuple[1] && tuple[2]) {
				dict[tuple[1]] = tuple[2]
			}
		})
		callback(null, dict)
	}
}

var configurator = {
	require_value: function(key, defaultValue) {
		configurator[key] = process.env[key] || defaultValue
		if (!configurator[key]) {
			console.error(`MISSING CONFIGURATION FOR KEY '${key}'`)
			process.exit(1)
		}
	},

	require_values: function(keylist, env_paths) {
		env_paths.forEach((path) => {
			loadEnv(path, (err, dict) => {Object.assign(env_dicts, dict)})
		})
		keylist.forEach((key) => { this.require_value(key, env_dicts[key]) })
	},

	standard_env_paths: function() {
		return [path.join(process.env.HOME, ".env"), "./.env"]
	},

	get: function(key, defaultValue) {
		var r = this[key] || defaultValue;
		if (!r) {
			throw Error(`MISSING CONFIGURATION FOR KEY '${key}'`)
		} else {
			return r
		}
	}
}

module.exports = configurator