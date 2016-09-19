function xmLog(params, loglevel, logconfig) {
  if (params.constructor.name != "Array") { // allow backward compatibility
    params = Array.prototype.slice.call(arguments); loglevel = null; logconfig = null;
  }
  if (loglevel == undefined) { loglevel = 7 }
  myLog(params, "(XML) " + currentTemplate, loglevel, logconfig);
}

