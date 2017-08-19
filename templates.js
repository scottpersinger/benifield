let mustache = require('mustache')

var $menus = {
    help: 
    	'{"text": "Pick an action",\
          "attachments": [\
          	{"text": "", \
             "callback_id": "help", \
             "actions": [ \
             	{{#button}} List records {{/button}} \
             	,{{#button}} Search records {{/button}} \
             	,{{#button}} Edit records {{/button}} \
               ] \
            } \
          ] \
        }',

    "List records":
        '{"text": "Browse records from different tables", \
         "backmenu": "help", \
         "attachments": [ \
            { "text": "", \
              "callback_id": "list", \
              "actions": [ \
              	{{#button}} Users {{/button}} \
                ,{{#button}} Accounts {{/button}} \
                ,{{#button}} Contacts {{/button}} \
                ,{{#button}} Leads {{/button}} \
                ,{{#button}}<< back{{/button}} \
              ] \
            } \
         ] \
        }'
}

function hasMenu(key) {
	return $menus[key] !== undefined
}

function menu(key) {
    var obj = {}
    obj.button = function() {return $button}

    var json = mustache.render($menus[key], obj)
    console.log(json)
    return JSON.parse(json)
}

var $templates = {
    'account':
        '{"mrkdwn_in": ["title"],\
          "thumb_url": "http://www.free-icons-download.net/images/office-building-icon-68715.png", \
          "color": "#439FE0", \
          "pretext": "...", \
          "title": "{{Name}}", \
          "text": "{{Description}}", \
          "fields": [ \
            {{#field}} {{AccountNumber}} {{/field}}, \
            {{#field}} {{Phone}} {{/field}}, \
            {{#field}} {{Id}} {{/field}}, \
            {{#field}} {{Website}} {{/field}} \
          ], \
          "footer": "{{LastModifiedDate}}", \
          "actions": [ \
            {{#button}} {{|Details}} {{/button}} \
          ] \
         }',

    'contact':
        '{"thumb_url": "http://v3.sportadministratie.be/_common/_images/111111_icoleden.png", \
        "color": "#9F43E0", \
        "title": "{{Name}}", \
        "text": "{{Account.Name}}", \
        "fields": [ \
            {{#field}} {{Email}} {{/field}}, \
            {{#field}} {{Phone}} {{/field}} \
        ], \
        "footer": "{{LastModifiedDate}}", \
        "actions": [ \
            {{#button}} {{|Details}} {{/button}} \
        ] \
       }',

    'user':
        '{"thumb_url": "http://v3.sportadministratie.be/_common/_images/111111_icoleden.png", \
        "color": "#9F43E0", \
        "title": "{{Name}}", \
        "text": "{{Email}}", \
        "fields": [ \
            {{#field}} {{Phone}} {{/field}} \
            ,{{#field}} {{Profile.Name}} {{/field}} \
        ], \
        "footer": "{{LastModifiedDate}}", \
        "actions": [ \
            {{#button}} {{|Details}} {{/button}} \
        ] \
       }',

    'lead':
        '{"pretext":"___",\
        "thumb_url": "http://v3.sportadministratie.be/_common/_images/111111_icoleden.png", \
        "color": "#9F43E0", \
        "title": "{{Name}}", \
        "text": "{{Email}}", \
        "fields": [ \
            {{#field}} {{City}} {{/field}} \
            ,{{#field}} {{State}} {{/field}} \
            ,{{#field}} {{Status}} {{/field}} \
            ,{{#field}} {{LeadSource}} {{/field}} \
        ], \
        "footer": "{{LastModifiedDate}}", \
        "actions": [ \
            {{#button}} {{|Details}} {{/button}} \
        ] \
       }'

}

function $field(text, render) {
    var fn = text.replace(/{{|}}/g,"")
    return `{"title": "${fn}", "value": "${render(text)}", "short":true}`
}

function $button(text, render) {
    var fn = text.replace(/{{|}}/g,"")
    fn = fn.trim()
    fn = fn.replace('|','')
    return `{"name": "${fn}", "text": "${fn}", "type": "button", "value": "${fn}"}`
}

function evalTemplate(template, sobject, object) {
    var t = $templates[sobject]
    if (!t) {
        return {error: "Missing template for " + sobject}
    }
    object.field = function() {return $field}
    object.button = function() {return $button}
    try {
        var json = mustache.render(t, object)
        var res = JSON.parse(json)
        return res
    } catch (e) {
        console.log(e)
        return {error: e}
    }
}

function parseTemplateFields(template) {
    var re = new RegExp(/\{\{([\w\.]+)\}\}/g)
    var fields = []
    var m
    while ((m = re.exec(template)) != null) {
        fields.push(m[1])
    }
    return fields   
}

function testTemplates() {
    for (var key in $templates) {
        var t = $templates[key]
        var fields = parseTemplateFields(t)
        var obj = {}
        fields.forEach((f) => {obj.f = `Field '${f}`})
        var res = evalTemplate(t, key, obj)
        if (res.error) {
            throw `Template failed, object '${key}': ${res.error}`
        }
    }
}
testTemplates()

module.exports = {
	menu: menu,
	hasMenu: hasMenu,
	evalTemplate: evalTemplate,
	templates: $templates,
	parseTemplateFields: parseTemplateFields
}