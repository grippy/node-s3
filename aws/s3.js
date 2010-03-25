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
function inspect(s){log(sys.inspect(s))}

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
    var url = "http://" + this.config.host + '/' + bucket + '/';
    if (object != undefined) url += object;
    return url
}


/*
Puts a file to the specified bucket
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
    object = put_object_options(args, this.config)
    options = put_options(args, object, this.config)
    rest.put([object.url, object.filename].join('/'), options).addListener('complete', cb);
}

function put_object_options(args, config) {
    var bucket = '', resource = '/';
    if (args.bucket) 
        bucket = args.bucket + '.';
        resource = '/' + args.bucket + '/';
        
    var o = {
        bucket:bucket,
        resource: resource,
        acl: (args.acl) ? args.acl : 'public-read',
        url: 'http://' + bucket + config.host,
        date:date()
    }

    if (args.file)
        o['file']=args.file;
        o['filename']=args.file.name;
        o['filepath']=resource + args.file.name;
        o['content_type'] = args.file.content_type
    return o;
}

function put_options(args, object, config) {

    var content_md5 = ''; // md5.b64_hmac_md5(f.data, f.data.length);
    var content_type = 'application/octet-stream';
    var amz_headers = [
        ['x-amz-acl', object.acl] 
        // not required ['X-Amz-Meta-ChecksumAlgorithm','crc32'],
        // not required ['X-Amz-Meta-FileChecksum', crc32.encode(f.data)],
    ];

    // add review to the amz_header if exists
    if (config.reviewer) {
        amz_headers.push( ['X-Amz-Meta-ReviewedBy', config.reviewer] )
    }
    
    var siggy = sign(config.secret, PUT, object.filepath, object.date, content_md5, object.content_type, canonicalize(amz_headers));
    var options = {
        // multipart: true,
        headers: {
            'Date': object.date,
            'User-Agent': config.user_agent,
            // 'Content-MD5': content_md5,
            'Content-Type': object.content_type, // content_type,
            'Content-Encoding': object.content_type,
            'Authorization': authorization(config.key, siggy) //,
            // 'Accept':'*/*'
        }
        // data: {
        //     'file': rest.file(f.path + f.name, f.content_type)
        //     'file': rest.data(f.name, f.content_type, f.data)
        // }
    }

    // add object file data
    if ( object.file.data != undefined) {
        options['encoding']='binary'
        options['data']=object.file.data;
        options.headers['Content-Length'] = object.file.data.length;
    }
    
    // remove this so s3 serves the file instread of offering to download
    // if (object.filename != undefined) {
    //     options.headers['Content-Disposition'] = " attachment; filename=\"" + object.filename + "\"";
    // }

    // add headers to options.headers
    for(var i=0; i < amz_headers.length; i++) {
        options.headers[amz_headers[i][0]] = amz_headers[i][1];
    }
    return options
}


exports.stream = function(config) {
    return new Stream(config);
}

function Stream(config){
    this.config = config;
    this.client = http.createClient(80, config.host);
    this.options = {};
    this.object = {};
    this.request = null;
    this.length=0;
}


/* 
Stream.open
    @args - the file metadata for the streaming object
    @resonse_cb - the response callback. the response object is of type http.ClientResponse
        function(resp) {
            resp
                .addListener('data', function(chunk){
                    // if your put request has an error, it will be returned here.
                })
                .addListener('end', function(){})
        }
*/
Stream.prototype.open = function(args, response_cb){
    // set object config
    this.object = put_object_options(args, this.config);
    this.options = put_options(args, this.object, this.config);
    this.options.headers.Host = this.config.host;
    // content-length: placeholder until we know the real length
    this.options.headers['Content-Length'] = '<content-length>'; 
    this.request = this.client.request('PUT', this.object.filepath, this.options.headers);
    this.request.addListener('response', response_cb || function (resp) {
        // the data listener is only returned if there is an error. todo: sniff the error message
        resp.addListener("data", function (chunk) {});
        // the end is always reached
        resp.addListener("end", function() {});
    });
}

Stream.prototype.write = function(chunk){
    // log('chunk.length:' + chunk.length.toString())
    this.length += chunk.length;
    this.request.write(chunk, 'binary')
}

Stream.prototype.close = function(args) {
    // replace the content-length placeholder
    this.request.output[0] = this.request.output[0].replace('<content-length>', this.length);
    this.request.close();
    // inspect(this.request)
}

Stream.prototype.unixtime = function(){
    return new Date().valueOf();
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
    var params = bucket_request_params(args.marker, args.maxkeys, args.prefix, args.delimiter);
    if (params.length) url += '?' + params;
    
    var dt = date();
    var siggy = sign(this.config.secret, GET, resource, dt, '', '', '');
    var options = {
        headers: {
            'Date': dt,
            'User-Agent': this.config.user_agent,
            'Authorization': authorization(this.config.key, siggy)
        },
        body:{}
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

exports.bucket_request_params = function(marker, maxkeys, prefix, delimiter){
    return bucket_request_params(marker, maxkeys, prefix, delimiter)
}

function bucket_request_params(marker, maxkeys, prefix, delimiter) {
    var params = [];
    if (marker != undefined) params.push('marker=' + marker);
    if (maxkeys != undefined) params.push('max-keys=' + maxkeys);
    if (prefix != undefined) params.push('prefix=' + prefix);
    if (delimiter != undefined) params.push('delimiter=' + delimiter);
    return params.join('&');
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

