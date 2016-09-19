function xmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
    params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params, "(XML) " + currentTemplate, loglevel, logconfig);
}

var jsonify = function(obj){
    var seen = {};
    var counter = 0;
    var json = JSON.stringify(obj, function(key, value){
        if (typeof value === 'object') {
            if ( value != null && seen.hasOwnProperty(value) ) {
                return '__cycle__' + (typeof value) + '[' + key + '(' + seen[value] + ')]'; 
            }
            seen[value] = counter;
            counter++;
            Logger.log("seen["+counter+"] is the value of %s", key);
        }
        return value;
    }, 4);
    return json;
};
