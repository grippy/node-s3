var fs = require("fs");
    
/*
Helper class for writing files to disk.
*/
exports.disk = function(path, options) {
    return new Disk(path, options);
}

function Disk(path, options){
    this.stream = fs.createWriteStream(path, options);
}

Disk.prototype.write = function(data, cb){
    this.stream.write(data, cb || function(err, bytesWritten){})
}

Disk.prototype.close = function(cb){
    this.stream.close(cb || function(){})
}
