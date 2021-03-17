/**
 * MinnoJS  plugin for pavlovia.org
 *
 * This plugin handles communications with the pavlovia.org server: it opens and closes sessions,
 * and uploads data to the server.
 * based on the plugin by Alain Pitiot https://lib.pavlovia.org/jspsych-pavlovia-3.0.0.js
 *
 */

define(function(){

	/**
	 * The version number.
	 *
	 * @type {string}
	 * @public
	 */
	var version = '1.0.0';

	/**
	 * The pavlovia.org configuration (usually read from the config.json configuration file).
	 *
	 * @type {Object}
	 * @private
	 */
	var _config = {};

	/**
	 * The server paramaters (those starting with a double underscore).
	 * @type {Object}
	 * @private
	 */
	var _serverMsg = {};

    /**
     * creates instance of pavlovia for MinnoJS
     *
     * @returns {Object} pavlovia
     * @returns {Object} pavlovia.logger - settings for API.addSettings
     * @returns {Object} pavlovia.finish - task for ending pavlovia study
     */
    function Pavlovia(){
        _init();
        var logger = {
            type:'csv',
            send: function(name, serialized, settings,ctx){ 
                return _finish(serialized);
            }
        };
        var finish = { type: 'postCsv' };
        return { logger:logger, finish: finish };
    }
    
    return Pavlovia;

    /**
     * Send xhr request
     *
     * @param {string} options.url
     * @param {string} options.method = 'POST'
     * @param {string} options.contentType =  'application/json; charset=UTF-8'
     * @param {Document|XMLHttpRequestBodyInit} options.body
     * @returns {Promise}
     */
    function xhr(options){
        return new Promise(function(resolve, reject){
            var request = new XMLHttpRequest();
            request.open(options.method || 'POST',options.url, true);
            request.setRequestHeader('Content-Type', options.contentType || 'application/json; charset=UTF-8');

            request.onreadystatechange = function() {
                if (request.readyState === 4) {
                    if (request.status >= 200 && request.status < 400) resolve(request.responseText);
                    else reject(new Error('Failed sending to: "' + options.url + '". ' + request.statusText + ' (' + request.status +')'));
                }
            };

            request.send(options.body);
        });
    }

	/**
	 * Initialise the connection with pavlovia.org: configure the plugin and open a new session.
	 *
	 * @param {string} [configURL= "config.json"] - the URL of the pavlovia.org json configuration file
	 * @returns {Promise<void>}
	 * @private
	 */
	function _init(configURL) {
        if (arguments.length < 1) configURL = 'config.json';

        return _configure(configURL)
            .then(function(response){
                _config = response;
                _log('init | _configure.response=', response);
                return _openSession();
            })
            .then(function(response){
                _log('init | _openSession.response=', response);
                // no need to setup unload events, MinnoJS does that for us
            })
            .catch(function(err){
                console.error('init | failed', err);
            });
	};


	/**
	 * Finish the connection with pavlovia.org: upload the collected data and close the session.
	 *
	 * @param {Object} data - the experiment data to be uploaded
	 * @returns {Promise<void>}
	 * @private
	 */
	function _finish(data) {
        return _save(data)
            .then(function(response){
                _log('finish | _save.response=', response);
                return _closeSession(true,false);
            }).
            then(function(response){
                _log('finish | _closeSession.response=', response);
            })
            .catch(function(err){
                console.error('finish | failed', err);
            });
	};

	/**
	 * Configure the plugin by reading the configuration file created upon activation of the experiment.
	 *
	 * @param {string} [configURL= "config.json"] - the URL of the pavlovia.org json configuration file
	 * @returns {Promise<any>}
	 * @private
	 */
    function _configure(configURL) {
        var response = { origin: '_configure', context: 'when configuring the plugin' };
        return _getConfiguration(configURL)
            .then(function(config){
               

                // tests for the presence of essential blocks in the configuration:
                if (!('experiment' in config))
                    throw 'missing experiment block in configuration';
                if (!('name' in config.experiment))
                    throw 'missing name in experiment block in configuration';
                if (!('fullpath' in config.experiment))
                    throw 'missing fullpath in experiment block in configuration';
                if (!('pavlovia' in config))
                    throw 'missing pavlovia block in configuration';
                if (!('URL' in config.pavlovia))
                    throw 'missing URL in pavlovia block in configuration';

                // get the server parameters (those starting with a double underscore):
                var urlQuery = window.location.search.slice(1);
                var urlParameters = new URLSearchParams(urlQuery);
                urlParameters.forEach((value, key) => {
                    if (key.indexOf('__') === 0) _serverMsg[key] = value;
                });

                return config;
            })
            .catch(function(err){
                throw Object.assign({error:err}, response);
            });
    }


	/**
	 * Get the pavlovia.org json configuration file.
	 *
	 * @param {string} configURL - the URL of the pavlovia.org json configuration file
	 * @returns {Promise<any>}
	 * @private
	 */
    function _getConfiguration(configURL){
		var response = { origin: '_getConfiguration', context: 'when reading the configuration file: ' + configURL };
        return xhr({url:configURL, method:'get'})
            .then(JSON.parse)
            .catch(function(err){ return {error:err}; })
            .then(function(config) { return Object.assign(response, config); });
	}

	/**
	 * Open a new session for this experiment on pavlovia.org.
	 *
	 * @returns {Promise<any>}
	 * @private
	 */
    function _openSession(){
        var url = _config.pavlovia.URL + '/api/v2/experiments/' + encodeURIComponent(_config.experiment.fullpath) + '/sessions';
        var response = {
            origin: '_openSession',
            context: 'when opening a session for experiment: ' + _config.experiment.fullpath
        };

        // prepare POST query:
        var formData = null
        if ('__pilotToken' in _serverMsg) formData = 'pilotToken=' + encodeURIComponent(_serverMsg.__pilotToken);

        return xhr({url:url, method:'post', body:formData, contentType:'application/x-www-form-urlencoded'})
            .then(JSON.parse)
            .then(function(data){
                console.log(data)
                // check for required attributes:
                if (!('token' in data)) {
                    reject(Object.assign(response, { error: 'unexpected answer from server: no token'}));
                }
                if (!('experiment' in data)) {
                    reject(Object.assign(response, { error: 'unexpected answer from server: no experiment'}));
                }

                // update the configuration:
                _config.session = { token: data.token, status: 'OPEN' };
                _config.experiment.status = data.experiment.status2;
                _config.experiment.saveFormat = data.experiment.saveFormat;
                _config.experiment.saveIncompleteResults = data.experiment.saveIncompleteResults;
                _config.experiment.license = data.experiment.license;
                _config.runMode = data.experiment.runMode;

                return Object.assign(response, { token: data.token, status: data.status });
            })
            .catch(function(err){
                console.error('error: ', err.error);
                return Promise.reject(Object.assign(response, {error:err}));
            });
    }

	/**
	 * Close the previously opened session on pavlovia.org.
	 *
	 * @param {boolean} isCompleted - whether or not the participant completed the experiment
	 * @param {boolean} [sync = false] - whether or not to use the Beacon API to comminucate with the server
	 * @private
	 */
	function _closeSession(isCompleted, sync){
        if (arguments.length < 1) isCompleted = true;
        if (arguments.length < 2) sync = false;

		var response = {
			origin: '_closeSession',
			context: 'when closing the session for experiment: ' + _config.experiment.fullpath
		};

		// prepare DELETE query:
		var url = _config.pavlovia.URL + '/api/v2/experiments/' + encodeURIComponent(_config.experiment.fullpath) + '/sessions/' + _config.session.token;

		// synchronous query the pavlovia server:
		if (sync && navigator.sendBeacon) {
			var formData = new FormData();
			formData.append('isCompleted', isCompleted);
			navigator.sendBeacon(url + '/delete', formData);
			_config.session.status = 'CLOSED';
            return Promise.resolved(response);
		}
        var body = 'isCompleted=' + isCompleted;

        return xhr({url:url, method:'delete', body:body, contentType:'application/x-www-form-urlencoded'})
            .then(JSON.parse)
            .then(function(data){
                _config.session.status = 'CLOSED';
                return Object.assign(response, {data});
            })
            .catch(function(err){
                console.error('error: ', err.error);
                return Promise.reject(Object.assign(response, {error:err}));
            });
	};


	/**
	 * Upload data to the pavlovia.org server.
	 *
	 * @param {Object} trial - the jsPsych trial
	 * @param {string} data - the experiment data to be uploaded
	 * @param {boolean} [sync = false] - whether or not to use the Beacon API to communicate with the server
	 * @return {Promise<any>}
	 * @private
	 */
	function _save(data, sync){
        if (arguments.length<2) sync = false;

		var date = new Date();
		var dateString = date.getFullYear() + '-' + ('0'+(1+date.getMonth())).slice(-2) + '-' + ('0'+date.getDate()).slice(-2) + '_';
		dateString += ('0'+date.getHours()).slice(-2) + 'h' + ('0'+date.getMinutes()).slice(-2) + '.' + ('0'+date.getSeconds()).slice(-2) + '.' + date.getMilliseconds();

		var key = _config.experiment.name + '_' + 'SESSION' + '_' + dateString + '.csv';

		if (_config.experiment.status === 'RUNNING' && !_serverMsg.__pilotToken) return _uploadData(key, data, sync);

        _offerDataForDownload(key, data, 'text/csv');

        return Promise.resolve({
            origin: '_save',
            context: 'when saving results for experiment: ' + _config.experiment.fullpath,
            message: 'offered the .csv file for download'
        });
    }


	/**
	 * Upload data (a key/value pair) to pavlovia.org.
	 *
	 * @param {string} key - the key
	 * @param {string} value - the value
	 * @param {boolean} [sync = false] - whether or not to upload the data using the Beacon API
	 * @returns {Promise<any>}
	 * @private
	 */
	function _uploadData(key, value, sync = false){
		var url = _config.pavlovia.URL + '/api/v2/experiments/' + encodeURIComponent(_config.experiment.fullpath) + '/sessions/' + _config.session.token + '/results';
		var response = {
			origin: '_uploadData',
			context: 'when uploading participant\' results for experiment: ' + _config.experiment.fullpath
		};

		// synchronous query the pavlovia server:
		if (sync && navigator.sendBeacon) {
			var formData = new FormData();
			formData.append('key', key);
			formData.append('value', value);
			navigator.sendBeacon(url, formData);
            return;
		}

		// asynchronously query the pavlovia server:
        var formKey = 'key=' + encodeURIComponent(key);
        var formValue= 'value=' + encodeURIComponent(value);
        var body = formKey + '&' + formValue;

        return xhr({url:url, method:'post', body:body, contentType:'application/x-www-form-urlencoded'})
            .then(JSON.parse)
            .catch(function(err){ return {error:err}; })
            .then(function(serverData){ return Object.assign(response, serverData); });
	};


	/**
	 * Log messages to the browser's console.
	 *
	 * @param {...*} messages - the messages to be displayed in the browser's console
	 * @private
	 */
	function _log(a,b) {
		console.log('[pavlovia ' + version + ']', a,b);
	};


	/**
	 * Offer data as download in the browser.
	 *
	 * @param {string} filename - the name of the file to be downloaded
	 * @param {*} data - the data
	 * @param {string} type - the MIME type of the data, e.g. 'text/csv' or 'application/json'
	 * @private
	 */
	function _offerDataForDownload(filename, data, type){
		var blob = new Blob([data], { type });

		if (window.navigator.msSaveOrOpenBlob) window.navigator.msSaveBlob(blob, filename);
		else {
			var elem = window.document.createElement('a');
			elem.href = window.URL.createObjectURL(blob);
			elem.download = filename;
			document.body.appendChild(elem);
			elem.click();
			document.body.removeChild(elem);
		}
	};
});
