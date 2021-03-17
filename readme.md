# MinnoJS pavlovia plugin

This repository holds the plugin for running MinnoJS studies on [Pavlovia](https://pavlovia.org/).

### Using the plugin
In order to use MinnoJS in Pavlovia, all you need to do is add [a plugin](https://cdn.jsdelivr.net/gh/minnojs/minnojs-pavlovia/minnojs.pavlovia.plugin.min.js) to you manager file.
In order to do so, require it at the first line of your script:

```js
define(['managerAPI', 'https://cdn.jsdelivr.net/gh/minnojs/minnojs-pavlovia/minnojs.pavlovia.plugin.min.js'], function(Manager, Pavlovia){
```

Activating the plugin is as simple as adding the following lines at the beginning of your script:

```js
var pavlovia = new Pavlovia();
API.addSettings('logger', pavlovia.logger);
```

Finally, if you want the logging to be performed before the end of your manager sequence, 
you can use a custom task `pavlovia.finish`:

```js
API.addSequence([
    {inherit:'task1'},
    {inherit:'task2'},
    {inherit:'task3'},
    pavlovia.finish,
    {inherit:'debriefing'}
]);
```

### Setting up Pavlovia
In order to use the plugin, make sure that pavlovia is set to save results as CSV.
