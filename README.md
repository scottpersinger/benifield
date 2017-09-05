# benifield
This is a work-in-progress app to integrate Salesforce into Slack via slash commands.

## Features

- Separate SF authentication for each user
- Full text search across standard objects
- List standard objects
- Easily create any standard or custom object

## Commands

### /force

Activate the interactive interface. Shows a menu from which you can choose to list, search, or create records.

### /force create <sobject> Field1=value Field2=value ...

Creates a new record of type given by `sobject`. Populate fields of the object using `<Field name>=<value>` syntax.
