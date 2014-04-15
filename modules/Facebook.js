var util = require('util');
var storage = require('node-persist');
var graph = require('fbgraph');
var request = require('request');
var qs = require('querystring');
var async = require('async');
var fs = require('fs');
var ExifImage = require('./ExifImage');


storage.initSync();

// TO DO: Search only photos on the Dayton page...



var Facebook = function(options) {

	if(!options.hasOwnProperty('client_id'))
		throw new Exception('Must provide a client_id');

	if(!options.hasOwnProperty('client_secret'))
		throw new Exception('Must provide a client_id');

	var self = this;
	self.name = "Facebook";
	self.settings = storage.getItem('facebook') || { last_poll: (new Date()).getDate()-7 };


	var access_token = null;
	var client_id = options.client_id;
	var client_secret = options.client_secret;
	var query = options.query;
	var directory = options.download_dir;

	fs.exists(directory, function(exists) {
		if (!exists) fs.mkdir(directory);
	});



	var polling_interval_ref = null;
	var polling_interval = 5000;
	this.start = function() {
		var _poll = function(err){
			self.poll(function(err){
				if(err) console.log(err);
				else polling_interval_ref = setTimeout(_poll, polling_interval);
			});
		}
		_poll();
	}


	this.get_access_token = function(done) {
		var query = {
			  client_id: client_id
			, client_secret: client_secret
			, grant_type: "client_credentials"
		};

		var request = '/oauth/access_token?'+qs.stringify(query);
		graph.get(request, function(err, res) {
			if(err) done(err)
			else {
				access_token = res.access_token;
				console.log("got facebook access token: "+access_token)
				done();
			}
		});
	}


	this.process_post = function(post, callback) {

		// var post_date = new Date(post.created_time);
		// var last_poll = new Date(settings.last_poll);

		console.log("== "+post.from.name);

		// if(post_date < last_poll) {
		// 	console.log("photo too old!");
		// 	callback()
		// 	return;
		// }
		if(!post.hasOwnProperty("picture")) {
			console.log("not a photo");
			callback();
			return;
		}


		if(!post.hasOwnProperty('picture'))
			throw new Exception("No picture found in photo post!");

		console.log(util.inspect(post));
		var id = post.id;
		var url = post.picture;
		var local_path = util.format("%s/%s.jpg", directory, id);

		fs.exists(local_path, function(exists){
			if(exists) {
				console.log("WARNING: fetched an image twice!");
				callback();
			} else {
				console.log(local_path);
				var writeStream = fs.createWriteStream(local_path);
				writeStream.on('close', function(){
					//console.log(util.format(post));
					console.log(post.from.name);
					console.log(post.caption);
					console.log(post.description);
					console.log(post.name);
					callback();
				});
				writeStream.on('error', callback);
				request(url).pipe(writeStream);
			}
		}); 
	}


	this.poll = function(callback){
		callback = callback || function(){}

		if(access_token==null) {
			self.get_access_token(function(err){
				if(err) callback(err);
				else self.poll( callback );
			});
			return;
		}

		console.log("facebook.poll");
	
		var data = {
			q: query, 
			fields: "id,name,type,created_time,from,picture",
			return_ssl_resources: 1,
			metadata: 1,
			type: 'post', 
			access_token: access_token, 
			since: Math.floor(new Date(self.settings.last_poll).getTime()/1000) 
		};
		var request = '/search?'+qs.stringify(data);
		console.log(request);

		graph.get(request, function(err, res){
			if(err) callback(err);
			else {

				console.log("found "+res.data.length+" posts")
				async.eachSeries(res.data, self.process_post, function(err){
					if(err) console.log(err);
					else {
						if(res.data.length>0) {
							self.settings.last_poll = new Date();
							storage.setItem('facebook', self.settings);
							console.log("settings.last_poll="+self.settings.last_poll);
						}
						callback();
					}
				});
			}
		});
	}
}

module.exports = Facebook;