var http = require("http"), 
    url = require("url"),
    sys = require("sys"),
    rest = require("./restler/lib/restler"),
    sha1 = require('./crypto/sha1')
    // ,
    // crc32 = require('./crypto/crc32'),
    // md5 = require('./crypto/md5')

// restler: http://github.com/danwrong/restler
// elasticnode http://github.com/halorgium/elasticnode
// http://docs.amazonwebservices.com/AmazonS3/latest/index.html?RESTObjectPUT.html
// http://docs.amazonwebservices.com/AmazonS3/latest/index.html?RESTAccessPolicy.html
// http://docs.amazonwebservices.com/AmazonS3/latest/dev/

/* verbage */
var PUT = 'PUT',
    GET = 'GET',
    DELETE = 'DELETE';
    
function log(s){sys.puts(s)}
function debug(s){sys.debug(s)}
function inspect(s){sys.inspect(s)}    

/* constructor class for s3 */
exports.init = function(args) {
    this.config = {
        'user_agent':'nodejs-s3-bastard-samurai',
        'host':'s3.amazonaws.com'
    }
    for (key in args) {
        this.config[key] = args[key];
    }
    // log(sys.inspect(this.config))
}

exports.url = function(bucket, object) {
    return "http://" + this.config.host + '/' + bucket + '/' + object
}


/*
Puts a file stream to the specified bucket
args = {
    bucket:'' // override for bucket
    name:''   // this name of the file once its uploaded
    content_type: '' // the type of the content to upload
    file:''   // the file descriptor
    data:''   // binary
 }
cb = function(data) {}
*/
exports.upload = function(args, cb){
    var bucket = '', resource = '/', f, url, put_url, acl, dt, filepath, filename;
    
    if (args.bucket) 
        bucket = args.bucket + '.';
        resource = '/' + args.bucket + '/';
    if (args.file) f = args.file;
    acl = (args.acl) ? args.acl : 'public-read';
    url = 'http://' + bucket + this.config.host;
    dt = date();
    filename = f.name;
    filepath = resource + filename;
    var content_md5 = ''; // md5.b64_hmac_md5(f.data, f.data.length);
    var content_type = 'application/octet-stream';
    var headers = [
        ['x-amz-acl', acl] 
        // not required ['X-Amz-Meta-ChecksumAlgorithm','crc32'],
        // not required ['X-Amz-Meta-FileChecksum', crc32.encode(f.data)],
    ];

    // add review to the header if exists
    if (this.config.reviewer){
        headers.push( ['X-Amz-Meta-ReviewedBy', this.config.reviewer] )
    }
    
    var siggy = sign(this.config.secret, PUT, filepath, dt, content_md5, content_type, canonicalize(headers));
    var options = {
        // multipart: true,
        headers: {
            'Date': dt,
            'User-Agent': this.config.user_agent,
            'Content-Length': f.data.length,
            // 'Content-MD5': content_md5,
            'Content-Type': content_type,
            'Content-Encoding': content_type,
            'Content-Disposition': " attachment; filename=\"" + filename + "\"",
            'Authorization': authorization(this.config.key, siggy)
        },
        encoding: 'binary',
        data: f.data 
        // data: {
        //     'file': rest.file(f.path + f.name, f.content_type)
        //     'file': rest.data(f.name, f.content_type, f.data)
        // }
    }
    
    // add headers to options.headers
    for(var i=0; i < headers.length; i++) {
        options.headers[headers[i][0]] = headers[i][1];
    }
    rest.put([url, filename].join('/'), options).addListener('complete', cb);
    
}

/*
Delete an object from the provided bucket
*/
exports.del = function(args, cb){
    var bucket = '', resource = '/', url, dt, filename;
    
    if (args.bucket) 
        // bucket = args.bucket + '.';
        resource = '/' + args.bucket + '/';
        
    url = 'http://' + bucket + this.config.host;
    dt = date();
    filename = args.filename;
    filepath = resource + filename;
    sys.puts(filepath)
    var siggy = sign(this.config.secret, DELETE, filepath, dt, '', '', '')
    var options = {
        headers: {
            'Date': dt,
            'User-Agent': this.config.user_agent,
            'Authorization': authorization(this.config.key, siggy)
        }
    }
    rest.del(url + filepath, options).addListener('complete', cb);

}


exports.bucket = function(args, cb){
    var bucket = '';
    var resource = '/';

    if (args.bucket != undefined) {
        bucket = args.bucket + '.';
        resource = '/' + args.bucket + '/';
    } 
    var url = 'http://' + bucket + this.config.host;
    var dt = date();
    var siggy = sign(this.config.secret, GET, resource, dt, '', '', '');
    var options = {
        headers: {
            'Date': dt,
            'User-Agent': this.config.user_agent,
            'Authorization': authorization(this.config.key, siggy)
        }
    };
    rest.get(url, options).addListener('complete', cb);
}

exports.create_bucket = function(args, cb){
    var bucket = '';
    var resource = '/';

    if (args.bucket != undefined) {
        // bucket = args.bucket
        resource = '/' + args.bucket + '/';
    } else {
        return 
    }

    acl = (args.acl) ? args.acl : 'public-read';
    url = 'http://' + this.config.host;
    dt = date();
    filepath = resource
    // var content_type = 'application/octet-stream';
    var headers = [
        ['x-amz-acl', acl] 
    ];
    var siggy = sign(this.config.secret, PUT, resource, dt, '', '', canonicalize(headers));
    var options = {
        // multipart: true,
        headers: {
            'Date': dt,
            'User-Agent': this.config.user_agent,
            // 'Content-Length': f.data.length,
            // 'Content-MD5': content_md5,
            // 'Content-Type': content_type,
            // 'Content-Encoding': content_type,
            // 'Content-Disposition': " attachment; filename=\"" + filename + "\"",
            'Authorization': authorization(this.config.key, siggy)
        }
    }
    
    // add headers to options.headers
    for(var i=0; i < headers.length; i++) {
        options.headers[headers[i][0]] = headers[i][1];
    }
    rest.put([url, resource].join(''), options).addListener('complete', cb);
}



function date(){
    return new Date().toUTCString();
}

function sign(secret, verb, resource, dt, md5, content_type, amz_headers){
    if (amz_headers) { amz_headers += '\n' }
    var s = verb + "\n" + md5 + "\n" + content_type + "\n" + dt + "\n" + amz_headers + resource;
    // sys.puts(s)
    // var signed = sha1.b64_hmac_sha1(secret, s)
    // sys.puts(signed)
    return sha1.b64_hmac_sha1(secret, s)
}
function authorization(key, signature) {
    return 'AWS ' + key + ':' + signature;    
}
function canonicalize(arr){
    var a = [], key, val;
    for (var i = 0; i < arr.length; i++){ 
        key = arr[i][0].toLowerCase();
        val = arr[i][1];
        a.push(key+':'+val)
    }
    return a.sort().join('\n')
}

