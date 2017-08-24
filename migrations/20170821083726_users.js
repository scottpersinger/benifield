
exports.up = function(knex, Promise) {
	return knex.schema.createTable('users', function(table) {
		table.bigincrements()
		table.timestamps()
		table.string('slack_user_id').notNullable()
		table.string('slack_team_id').notNullable()
		table.string('sf_org_id')
		table.jsonb('slack')
		table.jsonb('salesforce')
	})
};

exports.down = function(knex, Promise) {
  return knex.schema.dropTable('users')
};
