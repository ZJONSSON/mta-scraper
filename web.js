/*jshint node:true*/
"use strict";
var PAGE_TIMEOUT = 20000,
    SCRAPE_DELAY = 20000;

var request = require("request"),
    express = require("express"),
    cheerio = require("cheerio"),
    app = express(),
    server = require('http').createServer(app).listen(5000),
    io = require("socket.io").listen(server,{'log level':2}),
    last = {};

var avis = require("./avis_map");

function scrape(station) {
  var ret  = [],
      url = "http://as0.mta.info/mnr/mstations/station_status_display.cfm?P_AVIS_ID="+station.avis_id+","+station.stop_name,
      stationNow = {},
      stationLast = last[station.stop_id];

  console.log("scraping",station);

  function pushMsg(train,msg) {
    var res = {msg:msg};
    res.data = (msg == 'departed') ? last[station.stop_id][train] : stationNow[train];
    io.sockets.emit('update',res);
    console.log(res);
  }

  var req = request(url,function(err,res,body) {
    if (err) return console.log("error "+err);
    var $ = cheerio.load(body);
    $("tr").map(function() {
      var td = this.children("td");
      var res = {};
      ["schedule","destination","track","status"].map(function(d,i) {
        var text = $(td[i]).text();
        res[d] = +text|| text;
      });
      res.train = +$("[name=train_name]",this.children()).attr("value");
      if (isNaN(res.train)) return;
      res.stop_name = station.stop_name;
      res.stop_id = station.stop_id;
      stationNow[res.train] = res;
    });


    if (stationLast) {
      Object.keys(stationLast).forEach(function(train) {
        if (!stationNow[train]) {
          console.log(train,stationNow[train]);
          pushMsg(train,"departed");
        }
      });

      Object.keys(stationNow).forEach(function(train) {
        var trainNow = stationNow[train],
            trainLast = stationLast[train] || {};

        if (!Object.keys(trainLast).length) pushMsg(train,"assigned");
        else if (trainNow.track !== trainLast.track || trainNow.status !== trainLast.status) pushMsg(train,"changed");
      });
    }

    last[station.stop_id] = stationNow;
  });

  var timeOut = setTimeout(function() {
    req.end();
    console.log("Closed (timeout");
  },PAGE_TIMEOUT);

  req.on("end",function() {
    clearTimeout(timeOut);
    setTimeout(function() {
      scrape(station);
    },SCRAPE_DELAY);
  });

}

avis.forEach(function(d,i) {
  setTimeout(function() { scrape(d); },i*5);
});

app.use("/",express.static("html/", {maxAge: 0}));