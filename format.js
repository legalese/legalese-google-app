

// ---------------------------------------------------------------------------------------------------------------- asvar_
function asvar_(str) {
  if (str == undefined) { return undefined }
  return str.toString()
	.replace(/[()']/g, "")  // "investor's things" becomes "investors_things"
	.replace(/\W/g, "_")
	.replace(/^_+/, "")
	.replace(/_+$/, "")
	.replace(/_+/g, "_")
	.toLowerCase();
}

// ---------------------------------------------------------------------------------------------------------------- formatify_
// the test cases reside at https://docs.google.com/spreadsheets/d/1ePst75jTH4MUimRs0PE-OdSmVHl-_dnXSKGe2ybcrzc/edit#gid=1160659087

// we want to match whatever the spreadsheet displays.
//     INPUT VALUE       INPUT FORMAT           SHOWN BY GOOGLE
// a1  999.9999          ""                     999.9999
// a2  999.9999          [$S$]#,##0.000         S$1,000.000
// a3  999.9999          #,##0.000              1,000.000
// a4  999.9999          #,##0                  1,000
// a5  999.9999          [$S$]#,##0             S$1,000
// a6  999.9999          #,##0.00000            999.99990
// a7  999.9999          0.###############      999.9999
// a8  999.9999          0.00%                  99999.99%
// a9  999.9999          0.0%                   100000.0%
//a10  999.9999          0%                     100000%
//a11  999.9999          0.00                   1000.00
//a12  999.9999          0                      1000
//
// b1  1000              ""                     1000
// b2  1000              [$S$]#,##0.000         S$1,000.000
// b3  1000              #,##0.000              1,000.000
// b4  1000              #,##0                  1,000
// b5  1000              [$S$]#,##0             S$1,000
// b6  1000              #,##0.00000            1,000.00000
// b7  1000              0.###############      1000
//
// c1  not a number lol  #,##0.00               not a number lol
// c2  ""                #,##0.00               ""
// c3  ""                0.###############      ""
// c4  ""                ""                     ""
//
// d1  -999.9999         ""                     -999.9999
// d2  -999.9999         [$S$]#,##0.000         -S$1,000.000
// d3  -999.9999         #,##0.000              -1,000.000
// d4  -999.9999         #,##0                  -1,000
// d5  -999.9999         [$S$]#,##0             -S$1,000
// d6  -999.9999         #,##0.00000            -999.99990
// d7  -999.9999         0.###############      -999.9999
// d8  -999.9999         0.00%                  -99999.99%
// d9  -999.9999         0.0%                   -100000.0%
// d10 -999.9999         0%                     -100000%

// readRows: row 8: processing row  test a var 1:
// formatify_(, 999.9999) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,999.9999) = 999.9999 (String)
// readRows(Incorporation): TERMS: test_a_var_1 = 999.9999 --> 999.9999 (String)

// readRows: row 9: processing row test a var 2:
// formatify_([$S$]#,##0.000, 999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,999.9999,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(999.9999,3.0,undefined): returning 1,000.000
// INFO: formatify_([$S$]#,##0.000,999.9999) = S$1,000.000 (String)
// readRows(Incorporation): TERMS: test_a_var_2 = 999.9999 --> S$1,000.000 (String)

// readRows: row 10: processing row test a var 3:
// formatify_(#,##0.000, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,3.0,undefined): returning 1,000.000
// INFO: formatify_(#,##0.000,999.9999) = 1,000.000 (String)
// readRows(Incorporation): TERMS: test_a_var_3 = 999.9999 --> 1,000.000 (String)

// readRows: row 11: processing row test a var 4:
// formatify_(#,##0, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,0.0,undefined): returning 1,000
// INFO: formatify_(#,##0,999.9999) = 1,000 (String)
// readRows(Incorporation): TERMS: test_a_var_4 = 999.9999 --> 1,000 (String)

// readRows: row 12: processing row test a var 5:
// formatify_([$S$]#,##0, 999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0,999.9999,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(999.9999,0.0,undefined): returning 1,000
// INFO: formatify_([$S$]#,##0,999.9999) = S$1,000 (String)
// readRows(Incorporation): TERMS: test_a_var_5 = 999.9999 --> S$1,000 (String)

// readRows: row 13: processing row test a var 6:
// formatify_(#,##0.00000, 999.9999) called. the input string is a Number
// digitCommas_(999.9999,5.0,undefined): returning 999.99990
// INFO: formatify_(#,##0.00000,999.9999) = 999.99990 (String)
// readRows(Incorporation): TERMS: test_a_var_6 = 999.9999 --> 999.99990 (String)

// readRows: row 14: processing row test a var 7:
// formatify_(0.###############, 999.9999) called. the input string is a Number
// INFO: formatify_(0.###############,999.9999) = 999.9999 (String)
// readRows(Incorporation): TERMS: test_a_var_7 = 999.9999 --> 999.9999 (String)

// readRows: row 15: processing row test a var 8:
// formatify_(0.00%, 999.9999) called. the input string is a Number
// INFO: formatify_(0.00%,999.9999) = 99999.99 (String)
// readRows(Incorporation): TERMS: test_a_var_8 = 999.9999 --> 99999.99 (String)

// readRows: row 16: processing row test a var 9:
// formatify_(0.0%, 999.9999) called. the input string is a Number
// INFO: formatify_(0.0%,999.9999) = 100000.0 (String)
// readRows(Incorporation): TERMS: test_a_var_9 = 999.9999 --> 100000.0 (String)

// readRows: row 17: processing row test a var 10:
// formatify_(0%, 999.9999) called. the input string is a Number
// INFO: formatify_(0%,999.9999) = 100000 (String)
// readRows(Incorporation): TERMS: test_a_var_10 = 999.9999 --> 100000 (String)

// readRows: row 18: processing row test a var 11:
// formatify_(0.00, 999.9999) called. the input string is a Number
// INFO: formatify_(0.00,999.9999) = 1000.00 (String)
// readRows(Incorporation): TERMS: test_a_var_11 = 999.9999 --> 1000.00 (String)

// readRows: row 19: processing row test a var 12:
// formatify_(0, 999.9999) called. the input string is a Number
// INFO: formatify_(0,999.9999) = 1000 (String)
// readRows(Incorporation): TERMS: test_a_var_12 = 999.9999 --> 1000 (String)

// readRows: row 20: processing row test b var 1:
// formatify_(, 1000) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,1000) = 1000 (String)
// readRows(Incorporation): TERMS: test_b_var_1 = 1000 --> 1000 (String)

// readRows: row 21: processing row test b var 2:
// formatify_([$S$]#,##0.000, 1000.0) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,1000.0,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(1000.0,3.0,undefined): returning 1,000.000
// INFO: formatify_([$S$]#,##0.000,1000) = S$1,000.000 (String)
// readRows(Incorporation): TERMS: test_b_var_2 = 1000.0 --> S$1,000.000 (String)

// readRows: row 22: processing row test b var 3:
// formatify_(#,##0.000, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,3.0,undefined): returning 1,000.000
// INFO: formatify_(#,##0.000,1000) = 1,000.000 (String)
// readRows(Incorporation): TERMS: test_b_var_3 = 1000.0 --> 1,000.000 (String)

// readRows: row 23: processing row test b var 4:
// formatify_(#,##0, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,0.0,undefined): returning 1,000
// INFO: formatify_(#,##0,1000) = 1,000 (String)
// readRows(Incorporation): TERMS: test_b_var_4 = 1000.0 --> 1,000 (String)

// readRows: row 24: processing row test b var 5:
// formatify_([$S$]#,##0, 1000.0) called. the input string is a Number
// asCurrency_([$S$]#,##0,1000.0,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(1000.0,0.0,undefined): returning 1,000
// INFO: formatify_([$S$]#,##0,1000) = S$1,000 (String)
// readRows(Incorporation): TERMS: test_b_var_5 = 1000.0 --> S$1,000 (String)

// readRows: row 25: processing row test b var 6:
// formatify_(#,##0.00000, 1000.0) called. the input string is a Number
// digitCommas_(1000.0,5.0,undefined): returning 1,000.00000
// INFO: formatify_(#,##0.00000,1000) = 1,000.00000 (String)
// readRows(Incorporation): TERMS: test_b_var_6 = 1000.0 --> 1,000.00000 (String)

// readRows: row 26: processing row test b var 7:
// formatify_(0.###############, 1000.0) called. the input string is a Number
// INFO: formatify_(0.###############,1000) = 1000 (String)
// readRows(Incorporation): TERMS: test_b_var_7 = 1000.0 --> 1000 (String)

// readRows: row 27: processing row test c var 1:
// formatify_(#,##0.00, not a number lol) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(#,##0.00,not a number lol) = not a number lol (String)
// readRows(Incorporation): TERMS: test_c_var_1 = not a number lol --> not a number lol (String)

// readRows: row 28: processing row test c var 2:
// formatify_(#,##0.00, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(#,##0.00,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_2 =  -->  (String)

// readRows: row 29: processing row test c var 3:
// formatify_(0.###############, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(0.###############,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_3 =  -->  (String)

// readRows: row 30: processing row test c var 4:
// formatify_(, ) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,) =  (String)
// readRows(Incorporation): TERMS: test_c_var_4 =  -->  (String)

// readRows: row 31: processing row  test d var 1:
// formatify_(, -999.9999) called. the input string is a String
// INFO: formatify(String) fell to default; will toString()
// INFO: formatify_(,-999.9999) = -999.9999 (String)
// readRows(Incorporation): TERMS: test_d_var_1 = -999.9999 --> -999.9999 (String)

// readRows: row 32: processing row test d var 2:
// formatify_([$S$]#,##0.000, -999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0.000,-999.9999,undefined)
// asCurrency_() chop = 3.0
// digitCommas_(-999.9999,3.0,undefined): returning -1,000.000
// INFO: formatify_([$S$]#,##0.000,-999.9999) = S$-1,000.000 (String)
// readRows(Incorporation): TERMS: test_d_var_2 = -999.9999 --> S$-1,000.000 (String)

// readRows: row 33: processing row test d var 3:
// formatify_(#,##0.000, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,3.0,undefined): returning -1,000.000
// INFO: formatify_(#,##0.000,-999.9999) = -1,000.000 (String)
// readRows(Incorporation): TERMS: test_d_var_3 = -999.9999 --> -1,000.000 (String)

// readRows: row 34: processing row test d var 4:
// formatify_(#,##0, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,0.0,undefined): returning -1,000
// INFO: formatify_(#,##0,-999.9999) = -1,000 (String)
// readRows(Incorporation): TERMS: test_d_var_4 = -999.9999 --> -1,000 (String)

// readRows: row 35: processing row test d var 5:
// formatify_([$S$]#,##0, -999.9999) called. the input string is a Number
// asCurrency_([$S$]#,##0,-999.9999,undefined)
// asCurrency_() chop = 0.0
// digitCommas_(-999.9999,0.0,undefined): returning -1,000
// INFO: formatify_([$S$]#,##0,-999.9999) = S$-1,000 (String)
// readRows(Incorporation): TERMS: test_d_var_5 = -999.9999 --> S$-1,000 (String)

// readRows: row 36: processing row test d var 6:
// formatify_(#,##0.00000, -999.9999) called. the input string is a Number
// digitCommas_(-999.9999,5.0,undefined): returning -999.99990
// INFO: formatify_(#,##0.00000,-999.9999) = -999.99990 (String)
// readRows(Incorporation): TERMS: test_d_var_6 = -999.9999 --> -999.99990 (String)

// readRows: row 37: processing row test d var 7:
// formatify_(0.###############, -999.9999) called. the input string is a Number
// INFO: formatify_(0.###############,-999.9999) = -999.9999 (String)
// readRows(Incorporation): TERMS: test_d_var_7 = -999.9999 --> -999.9999 (String)

// readRows: row 38: processing row test d var 8:
// formatify_(0.00%, -999.9999) called. the input string is a Number
// INFO: formatify_(0.00%,-999.9999) = -99999.99 (String)
// readRows(Incorporation): TERMS: test_d_var_8 = -999.9999 --> -99999.99 (String)

// readRows: row 39: processing row test d var 9:
// formatify_(0.0%, -999.9999) called. the input string is a Number
// INFO: formatify_(0.0%,-999.9999) = -100000.0 (String)
// readRows(Incorporation): TERMS: test_d_var_9 = -999.9999 --> -100000.0 (String)

// readRows: row 40: processing row test d var 10:
// formatify_(0%, -999.9999) called. the input string is a Number
// INFO: formatify_(0%,-999.9999) = -100000 (String)
// readRows(Incorporation): TERMS: test_d_var_10 = -999.9999 --> -100000 (String)

function formatify_(format, string, sheet, fieldname) {
  var toreturn;
  var chop = 0;
  var mymatch;

  if (format != undefined) {
	if (string != undefined && string.constructor.name == "Boolean") {
	  return string;
	}

	var matches;
	// currency: [$S$]#,##0.000
	// TODO: also handle "$"#,##0
	//[15-07-09 02:10:38:840 HKT] learned that JFDI round.JFDI.2014 Pte. Ltd..money = S$25,000 (orig=25000.0) (format=[$S$]#,##0)
	//[15-07-09 02:10:38:841 HKT] learned that TOTAL.JFDI.2014 Pte. Ltd..money = 25000 (orig=25000.0) (format="$"#,##0)

	
    if (matches = format.match(/\[\$(.*)\]|"\$\"#/)) {
	  toreturn = asCurrency_(format, string);
    }
	// percentage: 0%  0.0%  0.00%
    else if (format.match(/%$/)) {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
      toreturn = (string * 100).toFixed(chop);
    }
	// date
    else if (format.match(/yyyy/)) {
    // INFO: expanding term Fri Dec 19 2014 00:00:00 GMT+0800 (HKT) with format yyyy"-"mm"-"dd
    // INFO: expanding term Thu Jan 15 2015 00:00:00 GMT+0800 (HKT) with format yyyy"-"mm"-"dd
      // toreturn = string.toString().substr(0,15).replace(/ 0/, " ");  // Jan 01 2015 => Jan 1 2015

	  if (string.toString().length == 0) { return "" }
//	  Logger.log("input date: " + string.toString().substr(0,15));
	  toreturn = Utilities.formatDate(new Date(string.toString().substr(0,15)),
									  sheet.getParent().getSpreadsheetTimeZone(),
									  "EEEE d MMMM YYYY");
//	  Logger.log("output date: " + toreturn);

    }
	else if (string != undefined && string.constructor.name == "Date") {
	  // [15-06-02 11:27:27:058 HKT] readRows: row 12: processing row Time of incorporation auto:
	  // [15-06-02 11:27:27:059 HKT] formatify_(HH:mm, Sat Dec 30 17:41:17 GMT+07:36 1899) called. the input string is a Date
	  // [15-06-02 11:27:27:061 HKT] readRows(Incorporation): TERMS: time_of_incorporation_auto = Sat Dec 30 17:41:17 GMT+07:36 1899 --> Sat Dec 30 17:41:17 GMT+07:36 1899 (Date)
	  // [15-06-02 11:27:27:062 HKT] readRows: row 13: processing row Time of incorporation manual:
	  // [15-06-02 11:27:27:063 HKT] formatify_(HH:mm:ss, Sat Dec 30 18:41:17 GMT+07:36 1899) called. the input string is a Date
	  // [15-06-02 11:27:27:065 HKT] readRows(Incorporation): TERMS: time_of_incorporation_manual = Sat Dec 30 18:41:17 GMT+07:36 1899 --> Sat Dec 30 18:41:17 GMT+07:36 1899 (Date)
	  // [15-06-02 11:27:27:066 HKT] readRows: row 14: processing row Time of incorporation manual hhmm:
	  // [15-06-02 11:27:27:067 HKT] formatify_(h":"mm" "am/pm, Sat Dec 30 18:41:17 GMT+07:36 1899) called. the input string is a Date
	  // [15-06-02 11:27:27:070 HKT] readRows(Incorporation): TERMS: time_of_incorporation_manual_hhmm = Sat Dec 30 18:41:17 GMT+07:36 1899 --> Sat Dec 30 18:41:17 GMT+07:36 1899 (Date)

	  // http://stackoverflow.com/questions/17715841/gas-how-to-read-the-correct-time-values-form-google-spreadsheet/17727300#17727300

	  Logger.log("formatify_(%s, %s) called. the input string is a %s", format, string, string != undefined ? string.constructor.name : "undef");

	  // Get the date value in the spreadsheet's timezone.
	  var spreadsheetTimezone = sheet.getParent().getSpreadsheetTimeZone();
	  var dateString = Utilities.formatDate(string, spreadsheetTimezone,
											'EEE, d MMM yyyy HH:mm:ss');
	  var date = new Date(dateString);

  // Initialize the date of the epoch.
	  var epoch = new Date('Dec 30, 1899 00:00:00');

	  // Calculate the number of milliseconds between the epoch and the value.
	  var diff = date.getTime() - epoch.getTime();

	  var myformat;
	  if      (format == 'h":"mm" "am/pm') { myformat = "h:mm a" }
	  else if (format == 'HH:mm')          { myformat = "H:mm" }
	  else if (format == 'HH:mm:ss')       { myformat = "H:mm:ss" }
	  Logger.log("formatify_(): spreadsheetTimezone=%s", spreadsheetTimezone);

	  toreturn = Utilities.formatDate(new Date(diff),
									  "UTC",
									  myformat);

	  // http://docs.oracle.com/javase/7/docs/api/java/text/SimpleDateFormat.html

	  return toreturn;
	}

	// automatic: 0   0.0   0.00
	else if (format.match(/^0/) && ! format.match(/%|#/) && string.constructor.name == "Number") {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
	  toreturn = string.toFixed(chop);
	}
	// automatic: 0.###############
	else if (format.match(/^0/) && string.constructor.name == "Number") {
	  toreturn = string.toString();
	}
	// number:  #,##0.000   #,##0
	else if (format.match(/^#.*#0/) && string.constructor.name == "Number") {
	  if (mymatch = format.match(/0\.(0+)/)) { chop = mymatch[1].length }
	  toreturn = digitCommas_(string, chop);
	}
	else {
	  // Logger.log("INFO: formatify(%s) fell to default; will toString()", string.constructor.name);
	  toreturn = string.toString();
	}
  }
  else { toreturn = string }
  // Logger.log("INFO: formatify_("+format+","+string+") = "+toreturn+ " ("+toreturn.constructor.name+")");
  return toreturn;
}

function asNum_(instr) {
  var num = instr;
  if (instr == undefined) { Logger.log("WARNING: asNum_() received an undefined argument"); return }
  if (instr.constructor.name == "Number") { num = instr.toString() }
  return num.replace(/[^.\d]/g,"");
}


function asCurrency_(currency, amount, chop) {
  // it would be nice to fill in the format string exactly the way Spreadsheets do it, but that doesn't seem to be an option.
  // failing that, it would be nice to get support for the ' option in sprintf, but it looks like formatString doesn't do that one either.
  // failing that, SheetConverter has a convertCell function that should do the job. https://sites.google.com/site/scriptsexamples/custom-methods/sheetconverter
  // but that doesn't work either. so we do it by hand.

	// TODO: also handle "$"#,##0
	//[15-07-09 02:10:38:840 HKT] learned that JFDI round.JFDI.2014 Pte. Ltd..money = S$25,000 (orig=25000.0) (format=[$S$]#,##0)
	//[15-07-09 02:10:38:841 HKT] learned that TOTAL.JFDI.2014 Pte. Ltd..money = 25000 (orig=25000.0) (format="$"#,##0)
  
  // currency can be either just "S$" or the full numberFormat specification string.

  // Logger.log("asCurrency_(%s, %s, %s)", currency, amount, chop);

  var mycurrency = currency;
  Logger.log("asCurrency_(%s,%s,%s)", currency, amount, chop);
  var mymatch;
  if (mymatch = currency.match(/#0\.(0+)/)) { chop = mymatch[1].length }
  if (currency.match(/#0$/))     { chop = 0 }
  Logger.log("asCurrency_() chop = %s", chop);

  var matches;
  if (matches = currency.match(/\[\$(.*)\]/)) { // currency
    mycurrency = matches[0].substring(2,matches[0].length-1).replace(/ /g," "); // nbsp
  }

  if (matches = currency.match(/"\$"/)) { // currency
    mycurrency = "$";
  }

  return mycurrency + digitCommas_(amount, chop);
}

function currencyFor_(string) {
  // extract the currency prefix
  var mymatch = string.match(/(.*?)\d/);
  if (mymatch && mymatch[1]) { return mymatch[1] }
}

