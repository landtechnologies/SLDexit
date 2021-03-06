var _ = require('underscore');
var util = require('util');
var path = require('path');
var async = require('async');
var parseString = require('xml2js').parseString;
var fs = require('fs');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();
var nrToParse = 1; //nr to check if last file is converted - if so the end of json file is written!
var nrParsed = 0; //Nr of parsed files so far

//--------------------MISSING PARTS-------------------------------
/*
Doesn't support:
 - Relative fields, such as:
  <Rotation>-
    <ogc:Mul>
      <ogc:PropertyName>orientation</ogc:PropertyName>
      <ogc:Literal>0.1</ogc:Literal>
    </ogc:Mul>
  </Rotation>
  Maybe this isn't an issue...

 - Need to fix how source and source layer are set

 - Anchor points??

*/

//-----------------------TODO-------------------------------------
//ADD YOUR SPECIFIC INFO HERE BEFORE RUNNING THE CODE:
var styleSpecName = 'os_mm';//choose the name you want
var sourceName = 'os_mm'; //name of source for the tiles you want the style specification to apply for
//var sourceUrl = 'https://api.landinsight.io/maps/os-mm/'; //URL to the tileJSON resource
var sourceUrl = '/maps/os-mm/tile';
var type = 'vector';//vector, raster, GeoJSON ++

//ENTER URL HERE
var SPRITE = "/maps/os-mm/sprite"; //e.g. https://www.mapbox.com/mapbox-gl-styles/sprites/sprite

//add path for directory where all files you want to convert are placed
//ONLY READS FILES WITH THE .sld EXTENSION
//var DIRECTORY_PATH = '~/LandTech/os-mm-styles';
//var DIRECTORY_PATH = 'exampleMultipleLayers';
var DIRECTORY_PATH = '../os-mm-styles/standard';

var SOURCE_LAYER_FILE_REGEX = {
  os_mm_topo_boundary_line: /boundaryline/i,
  os_mm_topo_cartographic_symbol: /cartographicsymbol/i,
  os_mm_topo_cartographic_text: /cartographictext/i,
  os_mm_topo_topographic_area: /topographicarea/i,
  os_mm_topo_topographic_line: /topographicline/i,
  os_mm_topo_topographic_point: /topographicpoint/i
};

//-----------------------  Run script  ------------------------//

//You can run the script either from one file or a directory of files.
//Comment out the one you don't want


var finish = function(err) {
  console.log("Finished");
  if (err) {
    console.log("Error:");
    console.log(err);
  }
};

parseAllFiles(DIRECTORY_PATH, finish); //parse all files in given directory

var SPECIFIC_FILE_PATH = 'exampleData/FKB_ElvBekk.xml'; //path of specific file
//parseSingleFile(SPECIFIC_FILE_PATH, finish); //Parse only one file


//-------------------------------------------------------------//

var RESULT_PATH = ''; //Add path you want result files written to

var VALID_SYMBOLIZERS = [
  'LineSymbolizer',
  'TextSymbolizer',
  'PolygonSymbolizer',
  'PointSymbolizer'
];

var VALID_ATTR_TAGS = [
  'Stroke',
  'Fill',
  'Label',
  'Font',
  'Halo',
  'Mark',
  'Size',
  'Geometry',
  'Graphic'
];
//attribute-tags that must be handeled different than the rest
var DIFF_ATTR_TAG = ['Label', 'Halo', 'Mark', 'Geometry', 'Graphic'];

//mapping from sld symbolizer til mapbox GL type-attribute
var CONV_TYPE = {
  'LineSymbolizer': 'line',
  'PolygonSymbolizer': 'fill',
  'TextSymbolizer': 'symbol',
  'PointSymbolizer': 'symbol'
};

//attributes that must be handeled different than the rest,
//and has relevant info placed differently (inner tag)
var DIFF_ATTR = ['stroke', 'opacity', 'fill', 'fill-opacity', 'font-size', 'stroke-width'];

//attrbiutes that belongs to the paint-object in Mapbox gl
var PAINT_ATTR = [
  'line-color', 'line-width', 'line-dasharray', 'line-opacity',
  'text-color', 'text-halo-color', 'text-halo-width', 'text-halo-blur', 'text-size',
  'fill-color', 'fill-opacity', 'fill-image',
  'icon-color', 'icon-opacity', 'icon-size'
];

//attributes that belongs to the layout-object in Mapbox gl
var LAYOUT_ATTR = [
  'text-field', 'text-font', 'text-max-size', 'text-max-witdth',
  'line-join', 'symbol-placement', 'icon-image'
];

//mapping from sld to mapbox
var CONVERT_ATTR_NAME = {
    'stroke': 'line-color',
    'stroke-width': 'line-width',
    'stroke-dasharray': 'line-dasharray',
    'stroke-linejoin': 'line-join',
    'opacity': 'line-opacity',
    'PolygonSymbolizer-Fill-fill': 'fill-color',
    'PolygonSymbolizer-Fill-fill-opacity': 'fill-opacity',
    'PolygonSymbolizer-Fill-opacity': 'fill-opacity',
    'font-size': 'text-size',
    'font-family': 'text-font',
    'Label': 'text-field',
    'TextSymbolizer-Halo-Fill-fill': 'text-halo-color',
    'TextSymbolizer-Fill-fill': 'text-color'
};

var PUNKT = 'circle-12'; //?
//get the icon-image
var CONV_ICON_IMG = {
  'FKB_Gravplass.xml': 'religious-christian-12',
  'FKB_BautaStatue.xml': 'monument-12',
  'FKB_Bensinpumpe.xml': 'fuel-24',
  'FKB_Broenn.xml': '',
  'FKB_Kum.xml': 'circle-stroked-24'
  //, 'FKB_MastTele':,'FKB_Mast_Telesmast'
};



//Since you can only have one sprite sheet, you will have to bake default images (lie circle.svg)
//into your spritesheet if you have a custom one

//NOTE: Don't use this, support circle layer types instead
var WELL_KNOWN_MARK_TO_IMAGE = {
  
};

var FILES_WRITTEN = [];

function parseIntOrFloat(val) {
  var parsedVal;
  try {
    var fl = parseFloat(val);
    parsedVal = fl;
  } catch (ex) {}
  if (parsedVal == null) {
    try {
      var int = parseInt(val, 10);
      val = int;
    } catch (ex) {}
    return val;
  }
  return parsedVal;
}


//translate zoom-scale to zoom-level
function scale_to_zoom(scale) {
  if (scale > 500000000) {
    return 0;
  }
  if (scale > 250000000) {
    return 1;
  }
  if (scale > 150000000) {
    return 2;
  }
  if (scale > 70000000) {
    return 3;
  }
  if (scale > 35000000) {
    return 4;
  }
  if (scale > 15000000) {
    return 5;
  }
  if (scale > 10000000) {
    return 6;
  }
  if (scale > 4000000) {
    return 7;
  }
  if (scale > 2000000) {
    return 8;
  }
  if (scale > 1000000) {
    return 9;
  }
  if (scale > 500000) {
    return 10;
  }
  if (scale > 250000) {
    return 11;
  }
  if (scale > 150000) {
    return 12;
  }
  if (scale > 70000) {
    return 13;
  }
  if (scale > 35000) {
    return 14;
  }
  if (scale > 15000) {
    return 15;
  }
  if (scale > 8000) {
    return 16;
  }
  if (scale > 4000) {
    return 17;
  }
  if (scale > 2000) {
    return 18;
  }
  if (scale > 1000) {
    return 19;
  }
  return 20;
}

function parseAllFiles(filePath, callback) {
  async.waterfall([
    function(cb) {
      writeStartOfJSON(cb);
    },
    function(cb) {
      fs.readdir(filePath, cb);
    }, 
    function(list, cb) {
      async.eachSeries(list, function(fileName, eachCb) {
        if (path.extname(fileName) === '.sld') {
          parse_sld_to_rules_tag(filePath + '/' + fileName, eachCb);
        } else {
          eachCb();
        }
      }, cb);
    },
    function(cb) {
      writeEndOfJSON(cb);
    }
  ], callback);
}

function parseSingleFile(file, callback) {
  async.waterfall([
    function(cb) {
      writeStartOfJSON(cb);
    },
    function(cb) {
      parse_sld_to_rules_tag(file, cb);
    },
    function(cb) {
      writeEndOfJSON(cb);
    }
  ], callback);
}

//parses the xml and finds symbolizer-element and type
function parse_sld_to_rules_tag(file, callback) {
  async.waterfall([
    function(cb) {
      fs.readFile(file, function (err, data) {
        if (err) {
          console.log(err);
        }
        cb(err, data);
      });
    }, 
    function(data, cb) {
      parseFile(data, file, cb);
    }
  ], callback);
}

function writeStartOfJSON(callback) {
  var top = '{ "version": 7, "name": "' + styleSpecName + '", "sources": { "' + sourceName + '": { "type": "vector", "url": "' + sourceUrl + '" } }, "glyphs": "mapbox://fontstack/{fontstack}/{range}.pbf", "sprite": "' + SPRITE + '", "layers": [ { "id": "background", "type": "background", "paint": { "background-color": "rgb(237, 234, 235)" } }';
  //  var top = '{ "version": 7, "name": "MapboxGLStyle2", "sources": { "norkart": { "type": "vector", "url": "mapbox://andersob.3ukdquxr" } }, "glyphs": "mapbox://fontstack/{fontstack}/{range}.pbf", "sprite": "https://www.mapbox.com/mapbox-gl-styles/sprites/sprite", "layers": [ { "id": "background", "type": "background", "paint": { "background-color": "rgb(237, 234, 235)" } }';
  async.waterfall([
    function(cb) {
      fs.writeFile(RESULT_PATH + '\Result.JSON', top + '\n', cb);
    },
    function(cb) {
      fs.writeFile(RESULT_PATH + '\errorFiles.txt', 'Files that could not be converted:' + '\n', cb);
    }
  ], function(err) {
    callback(err);
  });
}

function writeEndOfJSON(callback) {
  console.log('writing end of json');
  var end = ']}';
  fs.appendFile(RESULT_PATH + '\Result.JSON', end, callback);
}

var parseFile = function (data, file, callback) {
  async.waterfall([
    function(cb) {
      console.log("Parsing file: " + file);
      parser.parseString(data, function (err, result) {
        var FeatureTypeStyle = result.StyledLayerDescriptor.NamedLayer[0].UserStyle[0].FeatureTypeStyle;
        var rulesArr = [];
        var k;
        var rules = [];
        for (k = 0; k < FeatureTypeStyle.length; k++) { //some files had more than one FeatureTypeStyle
          var rulesVer = (FeatureTypeStyle[k].Rule);
          var rule;
          for (rule = 0; rule < rulesVer.length; rule++) {
            //pushes all rules-tag in different FeatureTypeStyle-tags to one array
            rules.push(rulesVer[rule]);
          }
        }
        cb(err, rules);
      });
    },
    function(rules, cb) {
      var dataToWrite = rules.reduce(function(curr, rule) {
        var name = rule.Name[0];

        var maxzoom = scale_to_zoom(rule.MaxScaleDenominator[0]);
        var minzoom = scale_to_zoom(rule.MinScaleDenominator[0]);
        var filterNode = rule['ogc:Filter'];
        var filter = parseFilter(filterNode);

        _.each(rule, function(val, key) {
          if ((VALID_SYMBOLIZERS.indexOf(key)) > -1) {
            //Sends object, symbolizer and filename
            curr.push([val, key, name, minzoom, maxzoom, filterNode, file]);
          }
        });
        return curr;
      }, []);


      async.eachSeries(dataToWrite, function(data, eachCb) {
        data.push(eachCb);
        writeJSON.apply(this, data);
      }, cb);
    }
  ], callback);
};

function parseFilter(filterNode) {
  if (filterNode) {
    function interpretKeyAndValues(filterValue, converter) {
      var result = [converter.op];
      var key = filterValue[converter.key];
      if (!key) {
        throw new Error("Error: Could not find filter key at property " + converter.key + " in filter " + filterName);
      }   
      result.push(key[0]);

      converter.values.forEach(function(valueKey) {
        var valContainer = filterValue[valueKey];
        if (!valContainer) {
          throw new Error("Error: Could not find filter value at property " + valueKey + " in filter " + filterName);
        }
        var val = parseIntOrFloat(valContainer[0]);
        
        result.push(val);
      });
      return result;
    };

    function interpretFilterList(filterValue) {
      var result = [];

      _.each(filterValue, function(val, key) {
        var converter = filterConverters[key];
        if (!converter) {
          throw new Error("Error: Filter not currently supported: " + key);
        }
        result.push(converter.exec(val[0], converter));
      });

      return result;
    }

    function interpretComposite(filterValue, converter) {
      var result = [converter.op];

      //console.log(filterValue);
      return result.concat(interpretFilterList(filterValue));
    };

    var filterConverters = {
      'ogc:PropertyIsEqualTo': {
        op: '==',
        key: 'ogc:PropertyName',
        values: ['ogc:Literal'],
        exec: interpretKeyAndValues
      },
      'ogc:PropertyIsNotEqualTo': {
        op: '!=',
        key: 'ogc:PropertyName',
        values: ['ogc:Literal'],
        exec: interpretKeyAndValues
      },
      'ogc:And': {
        op: 'all',
        exec: interpretComposite
      }
    };

    var filterRoot = filterNode[0];

    var mapboxFilter = interpretFilterList(filterRoot);

    if (mapboxFilter.length == 1) {
      mapboxFilter = mapboxFilter[0];
    }

    return mapboxFilter;
  }
  return null;
}

//called for each symbolizer
//this runs the rest of the methods through make_JSON and so on, and writes the objects to file
function writeJSON(symbTag, type, name, minzoom, maxzoom, filterNode, file, callback) {
  var errorFiles = [];
  var convType = convertType(type, symbTag);
  try {
    var filter = parseFilter(filterNode);
    var cssObj = getSymbolizersObj(symbTag, type, convType, file);
    var toWrite = [];

    var sourceLayer = null;

    _.find(SOURCE_LAYER_FILE_REGEX, function(regex, layerName) {
      if (regex.test(file)) {
        sourceLayer = layerName;
        return true;
      }
      return false;
    });

    if (!sourceLayer) {
      console.log("Warning: File '" + file + "' did not match any regexes for identification of source layer. Check SOURCE_LAYER_FILE_REGEX at the top of the file if this should not be the case.");
    }

    //if css-obj contains both fill and stroke, you have to split them into two layers
    if (cssObj['fill-color'] !== undefined && cssObj['line-color'] !== undefined) {
      var attPos = (Object.keys(cssObj)).indexOf('line-color');
      var i;
      var obj = {};
      var size = ((Object.keys(cssObj)).length);
      for (i = attPos; i < (size); i++) {
        //since i delete for each loop, it will always be this position
        var key = Object.keys(cssObj)[attPos];
        obj[key] = cssObj[key];
        delete cssObj[key];
      }
      var styleObj1 = make_JSON(sourceLayer, name, convType, cssObj, minzoom, maxzoom, filter);
      var styleObj2 = make_JSON(sourceLayer, name, 'line', obj, minzoom, maxzoom, filter);
      var print1 = JSON.stringify(styleObj1, null, 4);
      var print2 = JSON.stringify(styleObj2, null, 4);
      console.log('Writing converted');
      toWrite.push(',\n' + print1);
      toWrite.push(',\n' + print2);
    } else {
      var styleObj = make_JSON(sourceLayer, name, convType, cssObj, minzoom, maxzoom, filter);
      print = JSON.stringify(styleObj, null, 4);
      toWrite.push(',\n' + print);
    }

    async.eachSeries(toWrite, function(data, cb) {
      fs.appendFile(RESULT_PATH + '\Result.JSON', data, cb);
    }, callback);
  } catch (err) {
    console.log("Error: Failed to parse file. See errorFiles.txt for more information");
    //writes a file with all the sld-files with errors
    fs.appendFile(RESULT_PATH + '\errorFiles.txt', file + '-' + name + '-Error:\n' + err.stack + '\n', callback);
  }
}

//this makes the layout of each mapbox-layout-object
//name=file name, css is an object [cssName: cssValue]pairs, cssName is ie stroke, stroke-width
function make_JSON(sourceLayer, name, type, cssObj, minzoom, maxzoom, filter) {
  var attr = getPaintAndLayoutAttr(cssObj);
  var paint = attr[0];
  var layout = attr[1];

  //Removing default-values, they are redundant
  if (Object.keys(paint).indexOf('fill-opacity') > -1) {
    if (paint['fill-opacity'] === 1) {
      delete paint['fill-opacity'];
    }
  }

  var styleObj = {
    'id': type + '-' + name,
    'type': type,
    'source': sourceName,
    'source-layer': sourceLayer,
    'minzoom': maxzoom,
    'maxzoom': minzoom,
    'layout': layout,
    'paint': paint,
    filter: filter
  };
  if (!Object.keys(layout).length > 0) { //if no layout attributes
    delete styleObj['layout'];
  }
  return styleObj;
}


function getSymbolizersObj(symbTag, type, convertedType, file) {
  //have to check all taggs in symbolizer
  var i;
  var cssObj = {};
  for (i = 0; i < Object.keys(symbTag[0]).length; i++) { //for all tags under <-Symbolizer>
    var tagName = Object.keys(symbTag[0])[i];
    if (VALID_ATTR_TAGS.indexOf(tagName) > -1) {  //if tag exists in valid-array, eks Stroke

       //if values are not in the regular place
      if (DIFF_ATTR_TAG.indexOf(tagName) > -1 ||
          ((tagName === 'Fill') && symbTag[0].Fill[0].GraphicFill !== undefined)) {
        var obj = getObjFromDiffAttr(tagName, type, convertedType, symbTag, file);
        for (var key in obj) {
          cssObj[key] = obj[key];
        }
      } else {//if common cssParameterTags
        //array with key-value pairs to add to cssObj
        var cssArray = getCssParameters(symbTag, tagName, type);
        var k;
        for (k = 0; k < cssArray.length; k++) {
          cssObj[cssArray[k][0]] = cssArray[k][1];
        }
      }
    } else if (tagName !== undefined) {
      //console.log(tagName+" is not a valid attribute tag");
    }
  }
  return cssObj;
}

function getCssParameters(symbTag, validAttrTag, type, outerTag) {
  var cssArr = [];
  if (outerTag === undefined) {
    var allCssArray = symbTag[0][validAttrTag][0]['CssParameter'];
  } else {
    var allCssArray = symbTag[0][outerTag][0][validAttrTag][0]['CssParameter'];
  }

  var nrOfCssTags = Object.keys(allCssArray).length;
  var j;
  for (j = 0; j < nrOfCssTags; j++) { //for all cssParameters
    var cssTag = allCssArray[j];
    var conv = convert_css_parameter(cssTag, validAttrTag, type, outerTag);
    cssArr.push(conv); //array with arrays of cssName and cssValue
  }
  return cssArr;
}

//gets called if attribute-values are not placed as the rest and therefor needs
//a different method the get the css-value
function getObjFromDiffAttr(tagName, type, convertedType, symbTag, file) {
  var obj = {};
  if (tagName === 'Label') {
    obj = getLabelObj(tagName, type, symbTag, obj);
  } else if (tagName === 'Fill') { //some fill-attributes are defined differently than the rest
    obj['fill-image'] = 'SPRITE-NAME';
  } else if (tagName === 'Halo') {
    obj = getHaloObj(tagName, type, symbTag, obj);
  } else if (tagName === 'Geometry') {
    obj = getGeometryObj(symbTag, obj);
  } else if (tagName === 'Graphic') {
    obj = getGraphicObj(file, symbTag, type, convertedType, obj);
  }
  return obj;
}

function getLabelObj(tagName, type, symbTag, obj) {
  var convertedTagName = convertCssName(tagName, tagName, type);
  obj[convertedTagName] = '{' + symbTag[0].Label[0]['ogc:PropertyName'][0] + '}';
  return obj;
}

function getHaloObj(tagName, type, symbTag, obj) {
  var j;
  for (j = 0; j < Object.keys(symbTag[0].Halo[0]).length; j++) {
    var innerTagName = (Object.keys(symbTag[0].Halo[0]))[j];

    if (innerTagName === 'Radius') {
      var value = symbTag[0].Halo[0]['Radius'][0]['ogc:Literal'][0];
      obj['text-halo-width'] = parseInt(value, 10);
    } else if (innerTagName === 'Fill') {
      //array with key-value pair to add in obj
      var cssArray = getCssParameters(symbTag, innerTagName, type, 'Halo');
      var k;
      for (k = 0; k < cssArray.length; k++) {
        obj[cssArray[k][0]] = cssArray[k][1];
      }
    } else {
      console.log('translation of: ' + innerTagName + ' is not added');
    }
  }
  return obj;
}

function getGeometryObj(symbTag, obj) {
  if (symbTag[0].Geometry[0]['ogc:Function'][0].$.name === 'vertices') {
    obj['icon-image'] = PUNKT;
  } else {
    console.log('Cannot convert attribute value: ' + symbTag[0].Geometry[0]['ogc:Function'][0].$.name + ', for tag Geometry');
  }
  return obj;
}
function getGraphicObj(file, symbTag, type, convertedType, obj) {
  try {
    var cssParamTag = symbTag[0].Graphic[0].Mark[0].Fill[0].CssParameter[0];

    obj['icon-color'] = getCssParameterValue(cssParamTag);
  } catch (err) {
  }
  //Sets size
  try {
    var size = symbTag[0].Graphic[0].Size[0];
    obj['icon-size'] = parseIntOrFloat(size);
  } catch (err) {
      console.log('Size does not exist in this graphic-tag');
  }
  if (convertedType !== 'circle') {
    obj['icon-image'] = getIconImage(file, symbTag);
  }

  if (!obj['icon-image'] && !obj['icon-color'] && convertedType !== 'circle') {
    console.log("Warning: Graphic doesn't have a colour or an image");
  } else if (convertedType === 'circle' && !obj['icon-color']) {
    console.log("Warning: Could not get colour for circle");
  }
  return obj;
}

function getIconImage(file, symbTag) {
  var img;
  var graphic;
  try {
    graphic = symbTag[0].Graphic[0];
    if (graphic.ExternalGraphic) {
      img = graphic.ExternalGraphic[0].OnlineResource[0].$['xlink:href'];
      img = path.basename(img).split('.')[0];
    } else if (graphic.Mark) {
      var wellKnownName = graphic.Mark[0].WellKnownName[0];
      img = WELL_KNOWN_MARK_TO_IMAGE[wellKnownName];
      if (!img) {
        console.log("Warning: Well known mark not supported: " + wellKnownName + ". File: " + file);
      }
    }
  } catch (err) {
    img = undefined;
    if (graphic) {
      console.log("Warning: Graphic object exists, but could not extract an image. File: " + file);
    }
  }
  return img;
}

function getCssParameterValue(cssTag) {
  var cssName = cssTag['$'].name;
  var cssValue;
  var regLetters = /^[a-zA-Z]+$/;
  var regInt = /^\d+$/;
  var regDouble = /^[0-9]+([\,\.][0-9]+)?$/g;
  var regNumbers = /^\d+$/;
  var hexColour = /^(?:[0-9a-fA-F]{3}){1,2}$/;

  try {
    var cssColorValue = cssTag['_'].split('#')[1];
    //testing if the value is a color:
    if ((DIFF_ATTR.indexOf(cssName)) > -1
      && !(regInt.test(cssTag['_']))
      && !(regDouble.test(cssTag['_']))
      && !regLetters.test(cssColorValue)
      && !hexColour.test(cssColorValue)
      && !regNumbers.test(cssColorValue) ) {//Check if different type of attribute
      console.log(cssTag(cssTag['_']), ' is not recognised as a css colour. Is this correct? If not, you need to add the type to the check of css colour values');
      cssValue = (cssTag['ogc:Function'][0]['ogc:Literal'][1]);
    } else {
      cssValue = cssTag['_'];
    }
  } catch (err) {
    if ((DIFF_ATTR.indexOf(cssName)) > -1
      && !(regInt.test(cssTag['_']))
      && !(regDouble.test(cssTag['_']))) {//Check if different type of attribute
      cssValue = cssTag['ogc:Function'] && cssTag['ogc:Function'][0]['ogc:Literal'] && cssTag['ogc:Function'][0]['ogc:Literal'][1];
      if (!cssValue) {
        console.log("Warning: Could not get css value for property: " + cssName + ". XML initial css tag: ");
        console.log(cssTag);
      }
    } else {
      cssValue = cssTag['_'];
    }
  }
  return cssValue;
}

//returns an array with css parameter name and value, correctly converted
//validAttrTag=name of outer tag, example stroke, fill, label
function convert_css_parameter(cssTag, ValidAttrTag, type, outerTag) {
  var cssName = cssTag['$'].name;
  var cssValue = getCssParameterValue(cssTag);
  
  var convertedCssName = convertCssName(cssName, ValidAttrTag, type, outerTag);
  var convertedCssValue = convertCssValue(cssValue, cssName);
  return [convertedCssName, convertedCssValue];
}

//Makes sure the attribute values are returned in the correct type and defined
//correctly (ie colors with a # in front)
function convertCssValue(cssValue, cssName) {

  //linejoin describes rendering with values; mitre/round/bevel
  if ((cssName === 'stroke' || cssName === 'stroke-linejoin' || cssName === 'stroke-linecap')) {
    //some colors are defined with #, others not.
    //Split removes the # if it exists, so i always end up with the color value without the #
    //linecap is a line-border with values; butt/round/square
    return '#' + cssValue.split('#')[cssValue.split('#').length - 1];
  }

  if (cssName === 'stroke-width'
    || cssName === 'stroke-opacity'
    || cssName === 'stroke--dashoffset') {
    return parseFloat(cssValue);
  }
  if (cssName === 'stroke-dasharray') {
    return cssValue.split(' ').map(Number);
  }

  if (cssName === 'fill') {
    //some colors are defined with #, others not. Split removes the # if it exists,
    //so i always end up with the color value without the #
    return '#' + cssValue.split('#')[cssValue.split('#').length - 1];
  }

  if (cssName === 'opacity' || cssName === 'fill-opacity') {
    return parseFloat(cssValue);
  }

  if (cssName === 'font-size') {
    return parseFloat(cssValue);
  }

  return cssValue;

}

function convertCssName(cssName, validAttrTag, type, outerTag) {
  var newName;
  if (cssName === 'fill'
    || cssName === 'fill-opacity'
    || cssName === 'opacity'
    && validAttrTag === 'Fill') {
    if (outerTag === undefined) {
      newName = CONVERT_ATTR_NAME[type + '-' + validAttrTag + '-' + cssName];

    } else {
      var newName = CONVERT_ATTR_NAME[type + '-' + outerTag + '-' + validAttrTag + '-' + cssName];
      if (newName === undefined) {
        console.log(
          'could not convert the attribute name: ' + type + '-' +
          outerTag + '-' + validAttrTag + '-' + cssName
        );
      }
    }
    return newName;
  } else {
    var newName = CONVERT_ATTR_NAME[cssName];
    //List to print those I know cannot be translated
    var ACCEPTED = ['font-weight', 'font-style'];
    //skip printing the ones I know are not translated
    if (newName === undefined && ACCEPTED.indexOf(newName) > -1) {
      console.log('could not convert the attribute name: ' + cssName);
    }
    return newName;
  }
}

function convertType(type, node) {
  //console.log(node);
  var type = CONV_TYPE[type];
  if (!type) {
    console.log('warning could not convert the type: ' + type);
  }

  if (type === 'symbol') {
    try {
      var graphicParent = _.find(node, function(child) {
        return !!child.Graphic;
      });
      //console.log(graphicParent.Graphic[0].Mark[0].WellKnownName[0]);
      if (graphicParent.Graphic[0].Mark[0].WellKnownName[0] === 'circle') {
        type = 'circle';
        //console.log(type);
      }
    } catch (ex) {}
  }
  return type;
}

//Makes paint object og layout object
function getPaintAndLayoutAttr(cssObj) {
  var paint = {};
  var layout = {};
  var i;
  for (i = 0; i < Object.keys(cssObj).length; i++) {// for all in cssObj
    var key = Object.keys(cssObj)[i];//becomes line-color
    var value = cssObj[key];
    if (PAINT_ATTR.indexOf(key) > -1) {
      paint[key] = value;
    } else if (LAYOUT_ATTR.indexOf(key) > -1) {
      layout[key] = value;
    } else {
      console.log('The css-key: ' + key + ', is not a valid paint or layout attribute');
    }
  }
  return [paint, layout];
}
