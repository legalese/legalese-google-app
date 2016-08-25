var express    = require('express');        
var app        = express();                 
var bodyParser = require('body-parser');
var mongodb = require('mongodb');
var ObjectID = mongodb.ObjectID;            // just in case we want to search by id
var uen = "uen";
var db;

mongodb.MongoClient.connect("mongodb://localhost:27017/test", function (err, database) {
    if (err) {
	console.log(err);
	process.exit(1);
    }
    // Save database object from the callback for reuse.
    db = database;
    console.log("Database connection ready");
});

// when POST is required; routes are not yet added

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080;        

// routes for API below here

var router = express.Router();

router.use(function(req, res, next) {
    // do logging
    console.log('Something is happening.');
    next();
});

// basic test

router.get('/', function(req, res) {
    res.json({ message: 'i am alive' });   
});

// actual routes

router.route("/company/uen/:id")
    .get(function(req, res) {
	db.collection(uen).findOne({ UEN: req.params.id }, function(err, doc) {
	    if (err) {
		handleError(res, err.message, "Failed to get contact");
	    } else {
		res.status(200).json(doc);
	    }
	});
    });


router.route("/company/:id")
    .get(function(req, res) {
	var request = req.params.id;
	var re = new RegExp(request, "i", "g");
	var cursor = db.collection(uen).find( {ENTITY_NAME: {$regex : re}} ).toArray(function (err, doc) {
	    res.status(200).json(doc);
	});
    });


// register routes

app.use('/api', router);

// start server

app.listen(port);
console.log('Magic happens on port ' + port);
