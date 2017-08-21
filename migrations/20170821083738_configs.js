
exports.up = function(knex, Promise) {
	return knex.schema.createTable('configs', function(table) {
		table.bigincrements()
		table.timestamps()
		table.string('slack_user_id').notNullable()
		table.string('slack_team_id').notNullable()
		table.jsonb('data')
	})
  
};

exports.down = function(knex, Promise) {
	return knex.schema.dropTable('configs')  
};
