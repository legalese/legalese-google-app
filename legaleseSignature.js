// this is exposed as the legaleseSignature library
//
// upon loading it sets the variable legaleseSignature._loaded = true;
// this is (not publicly) available at
// M_Wuaitt08FDk5mzAwEoxpXYH5ITXFjPS

var _loaded = true;

function getDigitalSignatureService(config) {
  var signatureService = config.signature_service;
  if (signatureService == undefined ||
	  signatureService.values == undefined ||
	  signatureService.values[0] == undefined
	 ) { return getEchoSignService() }
  // one day, maybe taking the default position here will be like taking the default search engine in Mozilla.

  signatureService = signatureService.values[0].toLowerCase();
  
  if (signatureService == "echosign" ) { return getEchoSignService() }
  if (signatureService == "docusign" ) { return getDocuSignService() }
  if (signatureService == "hellosign") { return getHelloSignService() }
  // new signature backends welcome here
}

function getDocuSignService() { }
function getHelloSignService() { }


// ---------------------------------------------------------------------------------------------------------------- getEchoSignService_
// oAuth integration with EchoSign
// EchoSign uses OAuth 2
// so we grabbed https://github.com/googlesamples/apps-script-oauth2
// and we turned on the library.
//
// the redirect url is https://script.google.com/macros/d/{PROJECT KEY}/usercallback


// TODO:
// generalize this to getDigitalSignatureService
// let there be a config in the spreadsheet for the end-user to specify the desired digital signature service backend.

function getEchoSignService() {
  // Create a new service with the given name. The name will be used when 
  // persisting the authorized token, so ensure it is unique within the 
  // scope of the property store.
  var toreturn = OAuth2.createService('echosign')

      // Set the endpoint URLs
      .setAuthorizationBaseUrl('https://secure.echosign.com/public/oauth')
      .setTokenUrl('https://secure.echosign.com/oauth/token')
      // Set the name of the callback function in the script referenced 
      // above that should be invoked to complete the OAuth flow.
      .setCallbackFunction('legaleseSignature.authCallback')

      // Set the property store where authorized tokens should be persisted.
      .setPropertyStore(PropertiesService.getDocumentProperties())

      // Set the scopes to request (space-separated for Google services).
      .setScope('agreement_read agreement_send agreement_write user_login');

  var ssid = SpreadsheetApp.getActiveSpreadsheet().getId();
  var ssname = SpreadsheetApp.getActiveSpreadsheet().getName();

  // TODO: see line 1254 of showSidebar. refactor this chunk so that it's available for showSidebar's purposes.
  var esApps = BUILD_INCLUDE(echosign-api-keys.json);
  // the BUILD_INCLUDE gets filled by the Makefile from an echosign-api-keys.json file resident under the build/ dir.
  
  if (esApps[ssid] != undefined) { ssname = ssid }
  if (esApps[ssname] == undefined) {
	Logger.log("unable to identify EchoSign OAuth credentials for this spreadsheet / project.");
	return null;
  }

  Logger.log("ssname has become %s", ssname);

  toreturn
      // Set the client ID and secret
      .setClientId(esApps[ssname].clientId)
      .setClientSecret(esApps[ssname].clientSecret)
  // from https://secure.echosign.com/account/application -- do this as a CUSTOMER not a PARTNER application.
      .setProjectKey(esApps[ssname].projectKey);

// see https://secure.echosign.com/public/static/oauthDoc.jsp#scopes
  toreturn.APIbaseUrl = 'https://secure.echosign.com/api/rest/v2';

//   var oAuthConfig = UrlFetchApp.addOAuthService("echosign");
//   oAuthConfig.setAccessTokenUrl(toreturn.tokenUrl_);
//   oAuthConfig.setRequestTokenUrl(toreturn.tokenUrl_);
//   oAuthConfig.setAuthorizationUrl(toreturn.tokenUrl_);
//   oAuthConfig.setConsumerKey(toreturn.clientId_);
//   oAuthConfig.setConsumerSecret(toreturn.clientSecret_);

  return toreturn;
}
 
// ---------------------------------------------------------------------------------------------------------------- showSidebar
function showSidebar(sheet) {
  var echosignService = getEchoSignService();
  if (echosignService == null) { return } // don't show the sidebar if we're not associated with an echosign api.

  echosignService.reset();
  // blow away the previous oauth, because there's a problem with using the refresh token after the access token expires after the first hour.

  // TODO: don't show the sidebar if our spreadsheet's project doesn't have an associated openid at the echosign end.
  // because sometimes the controller does the thing, and this version of code.gs is only used for the form submit callback,
  // but not for Send to EchoSign.

  if (echosignService.hasAccess()) {
	Logger.log("showSidebar: we have access. doing nothing.");
  } else {
	Logger.log("showSidebar: we lack access. showing sidebar");
    var authorizationUrl = echosignService.getAuthorizationUrl();

	var myTemplate = '<p><a href="<?= authorizationUrl ?>" target="_blank">Authorize EchoSign</a>. ' +
      'Close this sidebar when authorization completes.</p>';

    var template = HtmlService.createTemplate(myTemplate);
    template.authorizationUrl = authorizationUrl;
    var page = template.evaluate();
	page
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setTitle('OAuth to EchoSign')
      .setWidth(300);
	SpreadsheetApp.getUi() // Or DocumentApp or FormApp.
      .showSidebar(page);

  }
}

// ---------------------------------------------------------------------------------------------------------------- authCallback
function authCallback(request) {
  var echosignService = getEchoSignService();
  var isAuthorized = echosignService.handleCallback(request);
  if (isAuthorized) {
    return HtmlService.createHtmlOutput('<p>Success! You can close this tab.</p><p>&#128077;</p><p>BTW the token property is ' +  PropertiesService.getDocumentProperties().getProperty("oauth2.echosign")+'</p>');
  } else {
    return HtmlService.createHtmlOutput('Denied. You can close this tab.');
  }
}

// ---------------------------------------------------------------------------------------------------------------- getLibraryDocuments_
function getLibraryDocuments_() {
  var api = getEchoSignService();
  var response = UrlFetchApp.fetch(api.APIbaseUrl + '/libraryDocuments',
								   { headers: { "Access-Token": api.getAccessToken() } });

  SpreadsheetApp.getUi().alert(response.getContentText());
}
// ---------------------------------------------------------------------------------------------------------------- fauxMegaUpload_
// upload a document to the template library
function fauxMegaUpload_() {
  // we do this using the web UI
}

// ---------------------------------------------------------------------------------------------------------------- fauxMegaSign_
// send a particular document from the template library for faux megasign
function fauxMegaSign(sheet) {
  var sheetPassedIn = ! (sheet == undefined);
  sheet = sheet || SpreadsheetApp.getActiveSheet();
  var entitiesByName = {};
  var readRows = legaleseMain.readRows(sheet, entitiesByName);
  var terms    = readRows.terms;
  var config   = readRows.config;

  var parties = terms.parties;
  var to_list = [];
  var cc_list = parties._allparties.filter(function(party){return party.legalese_status.toLowerCase()=="cc"}); // TODO: get this a different way
  var cc2_list = [];
  var commit_updates_to = [];
  var commit_updates_cc = [];

  // is the desired document in the library?
  var libTemplateName = config.echosign.tree.libTemplateName != undefined ? config.echosign.tree.libTemplateName : undefined;

  if (libTemplateName == undefined) {
	Logger.log("libTemplateName not defined in README. not uploading agreement.");
	return;
  }

  var now = Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "yyyyMMdd-HHmmss");
  
  for (var p in parties._unmailed) {
	var party = parties._unmailed[p];
	// if multi-address, then first address is To: and subsequent addresses are CC
	var to_cc = legaleseMain.email_to_cc(party.email);
	if (to_cc[0] != undefined && to_cc[0].length > 0) {
	  party._email_to = to_cc[0];
	  to_list.push(party);
	  party._commit_update_to = legaleseMain.getPartyCells(sheet, terms, party);
	}
	if (to_cc[1].length > 0) {
	  cc2_list = cc2_list.concat(to_cc[1]);
	}
  }
  Logger.log("we shall be emailing to %s", to_list.join(", "));

  if (to_list.length == 0) {
	SpreadsheetApp.getUi().alert("There doesn't seem to be anybody for us to mail this to! Check the Legalese Status column.");
	return;
  }

  // TODO: who shall we cc to? everybody whose legalese status == "cc".
  for (var p in cc_list) {
	var party = cc_list[p];
	party._commit_update_cc = legaleseMain.getPartyCells(sheet, terms, party);
  }
  cc_list = cc_list.map(function(party){return party.email});
  cc_list = cc_list.concat(cc2_list);

  Logger.log("To: %s", to_list.join(", "));
  Logger.log("CC: %s", cc_list.join(", "));

  var ss = sheet.getParent();

  for (var p in to_list) {
	var party = to_list[p];
	var emailInfo = [{email:party._email_to, role:"SIGNER"}];
	
	var acr = postAgreement_(	{ "libraryDocumentName": libTemplateName },
								emailInfo,
								config.echosign.tree.message,
								config.echosign.tree.title,
								cc_list,
								terms,
								config,
								null
							);
	
	party._commit_update_to.legalese_status.setValue("mailed echosign " + now);
	Logger.log("fauxMegaSign: well, that seems to have worked!");
  }
  Logger.log("fauxMegaSign: that's all, folks!");
}

function templateTitles(templates) {
  if (templates.length == 1) { return templates[0].title }
  return templates.map(function(t){return t.sequence}).join(", ");
}


// ---------------------------------------------------------------------------------------------------------------- uploadAgreement
// send PDFs to echosign.
// if the PDFs don't exist, send them to InDesign for creation and wait.
// for extra credit, define a usercallback and associate it with a StateToken so InDesign can proactively trigger a pickup.
// for now, just looking for the PDFs in the folder seems to be good enough.
function uploadAgreement(sheet, interactive) {
  // TODO: we need to confirm that the docs generated match the current sheet.
  // exploded docs need to have a different set of email recipients for each document.

  var echosignService = getEchoSignService();
  // blow away the previous oauth, because there's a problem with using the refresh token after the access token expires after the first hour.
  if (!echosignService.hasAccess()) {
	SpreadsheetApp.getUi().alert("we don't have echosign access. Reload this page so the sidebar appears, then click on the OAuth link.");
	return "echosign fail";
  }
  else {
	Logger.log("uploadAgreement: we have echosignService hasAccess = true");
  }

  var sheetPassedIn = ! (sheet == undefined);

  if (interactive == undefined || interactive) {
	var ui = SpreadsheetApp.getUi();
	var response = ui.alert("Send to EchoSign?",
							"Are you sure you want to send to EchoSign?\nMaybe you clicked a menu option by mistake.",
							ui.ButtonSet.YES_NO);
	if (response == ui.Button.NO) return;
  }
  
  if (! sheetPassedIn && SpreadsheetApp.getActiveSpreadsheet().getName().toLowerCase() == "legalese controller") {
	Logger.log("in controller mode, switching to uploadOtherAgreements()");
	uploadOtherAgreements_(false);
	return;
  }
  
  sheet = sheet || SpreadsheetApp.getActiveSheet();

  var ss = sheet.getParent();
  var entitiesByName = {};
  var readRows = legaleseMain.readRows(sheet, entitiesByName);
  var terms    = readRows.terms;
  var config   = readRows.config;

  var readmeDoc = legaleseMain.getReadme(sheet);

  // TODO: be more organized about this. in the same way that we generated one or more output PDFs for each input template
  // we now need to upload exactly that number of PDFs as transientdocuments, then we need to uploadAgreement once for each PDF.

  var parties = legaleseMain.roles2parties(readRows);

  var suitables = legaleseMain.suitableTemplates(readRows);
  Logger.log("resolved suitables = %s", suitables.map(function(e){return e.url}).join(", "));

  var docsetEmails = new legaleseMain.docsetEmails(sheet, readRows, parties, suitables);

  // we need to establish:
  // an AGREEMENT contains one or more transientDocuments
  // an AGREEMENT has one list of To and CCs
  // 
  // an Agreement is keyed on one or more sourcetemplate filenames
  // corresponding exactly to the docsetEmails Rcpts function
  // 

  var transientDocumentIds = {}; // pdf filename : transientDocumentId

  var uploadTransientDocument = function(sourceTemplates, entity, rcpts) {
	var sourceTemplate = sourceTemplates[0];
	var filename = legaleseMain.filenameFor(sourceTemplate, entity) + ".pdf";

	var api = getEchoSignService();
	var o = { headers: { "Access-Token": api.getAccessToken() } };
	o.method = "post";
	var folderId   = legaleseMain.getDocumentProperty(sheet, "folder.id");
	var folderName = legaleseMain.getDocumentProperty(sheet, "folder.name");
	Logger.log("uploadTransientDocument: folder.id = %s", folderId);
	if (folderId == undefined) {
	  throw("can't find folder for PDFs. try Generate PDFs.");
	}
	var folder = DriveApp.getFolderById(folderId);
	var pdf = folder.getFilesByName(filename);
	var pdfs = [];
	while (pdf.hasNext()) { pdfs.push(pdf.next()) }

	if (pdfs.length == 0) { throw("can't find PDF named " + filename) }
	if (pdfs.length  > 1) { throw("multiple PDFs are named " + filename) }

	var pdfdoc = pdfs[0];
	o.payload = {
	  "File-Name": pdfdoc.getName(),
	  "File":      pdfdoc.getBlob(),
	  "Mime-Type": pdfdoc.getMimeType(), // hope that's application/pdf
	};

	Logger.log("uploadTransientDocument: uploading to EchoSign: %s %s", pdfdoc.getId(), pdfdoc.getName());
	if (o.payload['Mime-Type'] != "application/pdf") {
	  Logger.log("WARNING: mime-type of document %s (%s) is not application/pdf ... weird, eh.", pdfdoc.getId(), pdfdoc.getName());
	}

	var response = UrlFetchApp.fetch(api.APIbaseUrl + '/transientDocuments', o);
	var r = JSON.parse(response.getContentText());
	Logger.log("uploadTransientDocument: %s has transientDocumentId=%s", pdfdoc.getName(), r.transientDocumentId);

	transientDocumentIds[filename] = r.transientDocumentId;

	Logger.log("uploadTransientDocument: recipients for %s = %s", pdfdoc.getName(), rcpts);
  };

  var multiTitles = function(templates, entity) { var ts = templates.constructor.name == "Array" ? templates : [templates];
												  return ts.map(function(t){return legaleseMain.filenameFor(t, entity)+".pdf"}).join(",") };

  var createAgreement = function(templates, entity, rcpts) {
	Logger.log("at this point we would call postAgreement for %s to %s",
			   multiTitles(templates, entity),
			   rcpts);

	if (entity && entity.skip_echosign) {
	  Logger.log("entity %s wants to skip echosign. so, not creating agreement.", entity.name);
	  return "skipping echosign as requested by entity";
	}
	
	var tDocIds = templates.map(function(t){return transientDocumentIds[legaleseMain.filenameFor(t,entity)+".pdf"]});

	if (tDocIds == undefined || tDocIds.length == 0) {
 	  Logger.log("transient documents were not uploaded to EchoSign. not uploading agreement.");
 	  readmeDoc.getBody().appendParagraph("nothing uploaded to EchoSign. not uploading agreement.");
 	  return "no docs found!";
	}

	var emailInfo = rcpts[0].map(function(e) { return {email:e, role:"SIGNER"}});
	var cc_list   = rcpts[1];

	if (emailInfo.length == 0) {
 	  // SpreadsheetApp.getUi().alert("no recipients for " + multiTitles(templates, entity) + " ... skipping.");
 	  return "no recipients!";
	}
	

	Logger.log("To: %s", emailInfo.map(function(party){return party.email}));
	Logger.log("CC: %s", cc_list);
 
	readmeDoc.appendHorizontalRule();
	readmeDoc.appendParagraph("To: " + emailInfo.map(function(party){return party.email}).join(", "));
	readmeDoc.appendParagraph("CC: " + cc_list.join(", "));

	// the exploded version needs a more specific title so the filenames don't clobber
	var esTitle = config.echosign.tree.title + " - " + templateTitles(templates);
	if (entity) esTitle += " - " + entity.name;
	
 	var acr = postAgreement_( tDocIds.map(function(t){return { "transientDocumentId": t } }),
 								emailInfo,
 								config.echosign.tree.message,
 								esTitle,
 								cc_list,
 								terms,
 								config,
 								readmeDoc,
 								null
 							);

 	Logger.log("createAgreement: well, that seems to have worked!");
  };
  
  Logger.log("uploadAgreements(): we upload the non-exploded normal templates as transientDocuments");
  docsetEmails.normal(uploadTransientDocument);

  Logger.log("uploadAgreements(): we upload the exploded templates as a transientDocument");
  docsetEmails.explode(uploadTransientDocument);

  // TODO: does this do the right thing when the constituent documents each have different to and cc parties?
  
  Logger.log("uploadAgreements(): we post the non-exploded normal transientDocuments as Agreements");
  if (config.concatenate_pdfs && config.concatenate_pdfs.values[0] == true) {
	docsetEmails.normal(function(){Logger.log("individual callback doing nothing")}, createAgreement );
  } else {
	docsetEmails.normal(createAgreement, function(){Logger.log("group callback doing nothing")});
  }

  Logger.log("uploadAgreements(): we post the exploded transientDocuments as Agreements");
  docsetEmails.explode(createAgreement);

  return "sent";
}


// ---------------------------------------------------------------------------------------------------------------- uploadOtherAgreements_
function uploadOtherAgreements_(interactive) {
  var sheets = legaleseMain.otherSheets();
  
  for (var i = 0; i < sheets.length; i++) {
	var sheet = sheets[i];
	var myRow = SpreadsheetApp.getActiveSheet().getRange(SpreadsheetApp.getActiveRange().getRow()+i, 1, 1, 10);
	var result = uploadAgreement(sheet, interactive);
	if (result == "sent") {
	  myRow.getCell(1,5).setValue("sent at "+ Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "yyyyMMdd-HHmmss"));
	  SpreadsheetApp.flush();
	}
	else {
	  myRow.getCell(1,5).setValue(result);
	}
  }
}


// ---------------------------------------------------------------------------------------------------------------- postAgreement_
function postAgreement_(fileInfos, recipients, message, name, cc_list, terms, config, readmeDoc, agreementCreationInfo) {
  var api = getEchoSignService();

  if (agreementCreationInfo == undefined) {
	agreementCreationInfo = {
	  "documentCreationInfo": {
		"signatureType": "ESIGN",
		"recipients": recipients,
		"ccs": cc_list , // everyone whose legalese status is cc
		"signatureFlow": "PARALLEL", // only available for paid accounts. we may need to check the user info and switch this to SENDER_SIGNATURE_NOT_REQUIRED if the user is in the free tier.
		"message": message,
		"fileInfos": fileInfos,
		"name": name,
	  },
	  "options": {
		"authoringRequested": false,
	  }
	};

	// TODO: if the data.expiry_date is defined then add 24 hours to it and stick it in
	// but also set the configuration option that decides if we should honour it or not.
	if (config.echosign_expires != undefined && config.echosign_expires.values[0]
	   && terms.expiry_date != undefined) {
	  
	  var days_until = ((new Date(terms._orig_expiry_date)).getTime() - (new Date()).getTime()) / (24 * 60 * 60 * 1000);
	  Logger.log("expiry date is %s days in the future. will give an extra day for leeway", days_until);
	  agreementCreationInfo.daysUntilSigningDeadline = days_until + 1;
	}
  }

  if (readmeDoc != undefined) readmeDoc.appendParagraph("agreementCreationInfo = " + JSON.stringify(agreementCreationInfo));

  var o = { headers: { "Access-Token": api.getAccessToken() },
			method: "post",
		  };
//  o.oAuthServiceName = "echosign";
//  o.oAuthUseToken = "always";

// this works in the postTransientDocument, but doesn't work here. how weird!
// see https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app
//  o.payload = agreementCreationInfo;

  o.contentType = 'application/json';
  o.payload = JSON.stringify(agreementCreationInfo);
// this is fucked up. we shouldn't have to do this manually.
// in postTransientDocument I don't have to. what a huge mystery!
// https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app

  Logger.log("about to dump %s", JSON.stringify(o));

  if (config.skip_echosign && config.skip_echosign.values[0] == true) {
 	Logger.log("skipping the sending to echosign");
  } else {
 	Logger.log("actually posting to echosign");
	var response = UrlFetchApp.fetch(api.APIbaseUrl + '/agreements', o);
	if (response.getResponseCode() >= 400) {
	  Logger.log("got response %s", response.getContentText());
	  Logger.log("dying");
	  return;
	}
	Logger.log("got back %s", response.getContentText());
	return JSON.parse(response.getContentText());
  }
}
