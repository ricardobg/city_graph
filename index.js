/*jshint esversion: 6 */

var geode = require('geode');
var GoogleMapsAPI = require('googlemaps');
var random = require("random-js")();
var fs = require('fs');

//Parameters
//TODO: Ask for them
var mapName = 'Uruguay';
var nCities = 30;
var nRoutes = 40;
var countryCode  = 'UY';
var stateCode = null;
var outputFile = "uruguay.txt";


if (process.argv.length != 3) {
    console.log("Usage: node index.js <GEONAMES_ACCOUNT>");
    console.log("To create a Geoname account, go to http://www.geonames.org/ and create, it is free!");
    return;
}

//Geonames.org API
var geo = new geode(process.argv[2], {language: 'en', country : 'US'});

//Google Maps API key (if possible, insert your on key)
var publicConfig = {
    key: 'AIzaSyAcM9nsttjFtb4uOSH4KqhBL-v_WzQkzNI',
    stagger_time:       1000, // for elevationPath
    encode_polylines:   false,
    secure:             true // use https
};
var gmAPI = new GoogleMapsAPI(publicConfig);


if (stateCode !== null) {
    //First: get admin code
    geo.search({country: countryCode, q: stateCode, fcode: 'ADM1', style: 'FULL'}, function(err, statesResult){
        if (err)
            return;
        if (statesResult.totalResultsCount != 1) {
            console.log("Error: Couldn't find state geoname code!");
            return;
        }

        var adminCode = statesResult.geonames[0].adminCode1;
        //Search for cities
        console.log("Loading " + nCities + " cities...");
        geo.search({country :countryCode, adminCode1: adminCode, maxRows: nCities, featureClass: 'P'}, treatCitiesSearchResult);
    });
}
else {
    console.log("Loading " + nCities + " cities...");
    geo.search({country: countryCode, maxRows: nCities, featureClass: 'P'}, treatCitiesSearchResult);
}

function treatCitiesSearchResult(err, rawResults) {
    console.log("Loaded cities!");
    if (rawResults.totalResultsCount < nCities) {
        console.log("Error: Couldn't find " + nCities + " cities (only " + rawResults.totalResultsCount + ")");
        return;
    }
    //Sort results using coordinates
    var results = rawResults.geonames.sort((a, b) => {
        return (a.lng - b.lng) + (a.lat - b.lat);
    });

    // Get indices
    var indices = generateRoutesIndex(nCities, nRoutes);
    // Routes
    var from = indices.map((el) => { return results[el.from]; });
    var to = indices.map((el) => { return results[el.to]; });
    console.log("Loading " + nRoutes + " routes...");
    getRoutesDistance(from, to,
        (dists) => {
            var output = "";
            // Map file
            output += mapName + "\n";
            
            // Write cities
            output += nCities + "\n";
            var i;
            for ( i = 0; i < nCities; i++) {
                var city = results[i]; 
                output += city.toponymName.split(" ").join("_") + " " + 
                            city.lng + " " + city.lat + "\n";
            }
            // Write routes
            output += nRoutes + "\n";
            for (i = 0; i < nRoutes; i++) {
                var cityName1 = results[indices[i].from].toponymName.split(" ").join("_");
                var cityName2 = results[indices[i].to].toponymName.split(" ").join("_");
                output += cityName1 + " " + cityName2 + " " + dists[i] + "\n";
            }
            console.log(output);
            fs.writeFile(outputFile, output, (err) => {
                if (err) {
                    console.log("Error: Couldn't write in file " + outputFile);
                    console.log(err);
                }
                else {
                    console.log("Done! File " + outputFile + " generated!");
                }
            });
        });
}


var maxPlaces = 1; // Max places per request (1 reduces the wasted amount of limit)
var googleMapsDelay = 0; // Delay between requests

/* from and to should be a list of objects containing lat and lng 
   call callback with a vector of distances in km
*/
function getRoutesDistance(from, to, callback) {
    gmAPI.distance(
    {
        origins: from.filter((el,index) => { return index < maxPlaces; })
                    .reduce((s,v)=> { return s + '|' + v.lat + ',' + v.lng; },''),
        destinations: to.filter((el,index) => { return index < maxPlaces; })
                    .reduce((s,v)=> { return s + '|' + v.lat + ',' + v.lng; },'')
    }, function (err, results) {
        if (err || results.error_message) {
            console.log("Error in Google Maps API: Couldn't calculate routes");
            if (err)
                console.log(err);
            else
                console.log(results.error_message);
            return;
        }
        var ret = [];
        for (var i = 0; i < results.rows.length; i++) {
            ret[i] = results.rows[i].elements[i].distance.value / 1000;
        }
        if (from.length > maxPlaces) {
            //Wait 1 second to now exceed google maps api limits
            setTimeout(() => {
                getRoutesDistance(from.filter((el,index) => { return index >= maxPlaces; }),
                    to.filter((el,index) => { return index >= maxPlaces; }),
                    (v) => {
                        callback(ret.concat(v));
                    });
            }, googleMapsDelay);
        }
        else {
            callback(ret);
        }

    });
}

/* Returns a list of objects containing from and to values.
   Gets nPlaces - 1 not random routes and then nPairs - (nPlaces - 1) random routes.
   Do not repeat pairs!
*/
function generateRoutesIndex(nPlaces, nPairs) {
    var pairsMap = {};
    var routes = 0;
    // Make sure every place is connected
    for (var i = 0; i <= nPlaces - 2; i++) {
        pairsMap[i + '_' + (i+1)] = {
            from: i,
            to: (i+1)
        };
        routes++;
    }
    // Get random routes
    while (routes < nPairs) {
        var origin = random.integer(0, nPlaces - 1);
        var destiny = random.integer(0, nPlaces - 1);
        if (origin != destiny &&
            !pairsMap[origin + '_' + destiny] &&
            !pairsMap[destiny + '_' + origin]) {
            //Add to map
            pairsMap[origin + '_' + destiny] = {
                from: origin,
                to: destiny
            };
            routes++;
        }
    }
    return Object.keys(pairsMap).map((v) => { return pairsMap[v]; });
}