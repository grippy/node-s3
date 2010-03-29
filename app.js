var http = require("http"),
    url = require("url"),
    multipart = require("multipart"),
    sys = require("sys"),
    events = require("events"),
    fs = require("fs"),
    helper = require("./lib/helper"),
    s3 = require("./aws/s3"),
    config = require('./config'),
    b64 = require('./aws/crypto/base64')

/* globals */
var env = null

function log(s){sys.puts(s)}
function debug(s){sys.debug(s)}
function inspect(o){log(sys.inspect(o))}
function str(v){return (v != undefined) ? v : '' }

function app(){
    return http.createServer(function(req, res) {
            // Simple path-based request dispatcher
            log(req.method + ' http://' + req.headers.host + req.url)
            switch (url.parse(req.url).pathname) {
                case '/':
                    display_form(req, res);
                    break;
                    
                //-> saves the upload to memory first
                case '/upload':
                    parse_request_params(req, res, upload_file);
                    break;
                    
                //-> streams the upload to s3
                case '/stream_upload':
                    stream_upload(req, res);
                    break;

                //-> saves the upload to disk and then streams to s3
                case '/save_then_stream_upload':
                    parse_request_params(req, res, save_then_stream_upload);
                    break;
                
                case '/stream_disk_stream_upload':
                    stream_disk_stream_upload(req,res)
                    break;
                case '/delete':
                    parse_request_params(req, res, delete_file);
                    break;
                case '/create_bucket':
                    parse_request_params(req, res, create_bucket);
                    break;
                case '/bucket':
                    parse_request_params(req, res, get_bucket);
                    break;
                case '/buckets':
                    buckets(req, res);
                    break;
                default:
                    show_404(req, res);
                    break;
            }
        })
}

function start(){
    var ports = config.base().ports,
        port = null;
    for(var i =0; i < ports.length; i++){
        port = ports[i]
        server = app()
        server.listen(port)
        sys.puts("Server running at http://127.0.0.1:" + port + "/");
    }
}

function parse_request_params(req, res, cb){
    var mp = multipart.parse(req),
        params = url.parse(req.url, true).query,
        name;
        
    // set default for params if undefined
    if (params==undefined) params = {};
        
    mp.addListener("partBegin", function(part) {
        name = part.name;
        if (name) {
            params[name] = "";
            filename = part.filename
            if (filename) {
                params[name + '-filename' ] = filename.replace(' ', '-') 
                params[name + '-content-type' ] = part.headers['content-type'] 
            }
            
        }
      });
    mp.addListener("body", function(chunk) {
        if (name) {
          //if (fields[name].length > 1024) return;
          params[name] += chunk;
        }
    });
    mp.addListener("complete", function() {
        req.params = params
        cb.call(this, req, res)
    })

}

function parse_argv(){
    var args = process.argv;
    var arg;
    for(var i=0; i < args.length; i++){
        arg = args[i];
        if (arg.indexOf('-')==0){
            if (arg.indexOf('-e=') > -1){
                env = arg.split('-e=')[1]
            }
            if (arg.indexOf('--e=') > -1){
                env = arg.split('--e=')[1]
            }
            if (arg.indexOf('--env=') > -1){
                env = arg.split('--env=')[1]
            }
        }
    }
}

// parse command line args
parse_argv();

// init config environment
config.init(env)

// create s3 instance
s3.init(config.base().s3)

// init server
start()

/*
* Paginate the contents of a bucket
*/
function get_bucket(req, res) {
    var b = req.params.b
    var marker = req.params.marker
    var maxkeys = req.params.maxkeys
    var delimiter = req.params.delimiter
    var prefix = req.params.prefix
    
    if (b) {
        s3.bucket({'bucket': b, 
                   'marker':marker, 
                   'maxkeys':maxkeys, 
                   'prefix': prefix, 
                   'delimiter':delimiter}, function(data){
            
            var a = [], 
                list = data.listbucketresult.contents,
                truncated = data.listbucketresult.istruncated,
                next_marker, o;

            for (var i=0; i < list.length; i++) {
                o = list[i]
                next_marker = o.key;
                a.push('<a href="'+ s3.url(b, o.key) +'">'+ o.key + '</a>'+ ' (' + o.size + ')' + '(<a href="/delete?filename='+o.key+'&bucket='+b+'">delete</a>)')
            }
            // add next pagination
            
            if (truncated == 'true'){
                var params = s3.bucket_request_params(next_marker, maxkeys, prefix, delimiter);
                a.push('<hr /><a href="?b='+ b +'&'+ params.replace('max-keys', 'maxkeys') +'">Next</a>')
            }
            
            res.writeHeader(200, {"Content-Type": "text/html"});
            res.write(
                '<html>'+
                '<head></head>'+
                '<body>'+
                '<h4>Search: '+ b +'</h4>' +
                '<form method="get">' +
                'Marker: <input type="text" name="marker" value="'+ str(marker) +'" /> <br />' +
                'Prefix: <input type="text" name="prefix" value="'+ str(prefix) +'" /> <br />' +
                'Delimiter: <input type="text" name="delimiter" value="'+ str(delimiter) +'" /> <br />' +
                'Max-Keys: <input type="text" name="maxkeys" value="'+ str(maxkeys) +'" /> <br />' +
                '<input type="hidden" name="b" value="'+ b +'" />' +
                '<input type="submit" name="search" value="search" />' +
                ' <a href="http://docs.amazonwebservices.com/AmazonS3/2006-03-01/API/index.html?RESTBucketGET.html">help?</a>' +
                '</form>' +
                '<h4>Bucket: '+ b +'</h4>' +
                '<hr />' +
                list.length + ' items' +
                '<hr />' + 
                a.join('<br />') +
                '</body>'+
                '</html>'
            );
            res.close();
        })
    }
 }

/*
* Create a bucket
*/
function create_bucket(req, res){
    log(sys.inspect(req.params))
    if (req.method == 'POST') {
        sys.puts('creating bucket... ' + req.params.bucket)
        s3.create_bucket({'bucket':req.params.bucket}, function(data){
            log(sys.inspect(data));
        })
    };
    res.writeHeader(200, {"Content-Type": "text/html"});
    res.write(
        '<html>'+
        '<head></head>'+
        '<body>'+
        '<form action="/create_bucket" method="post" enctype="multipart/form-data">'+
        '<input type="text" name="bucket" value="" />'+
        '<input type="submit" value="create bucket" />'+
        '</form>'+
        '</body>'+
        '</html>'
    );
    res.close();    
    
}


/*
* Display a list of buckets for this account. Doesn't paginate.
*/
function buckets(req, res){
    s3.bucket({}, function(data){
        // log(sys.inspect(data.listallmybucketsresult.buckets.bucket))
        var a = [], 
            list = data.listallmybucketsresult.buckets.bucket, 
            b;
        
        for (var i=0; i < list.length; i++) {
            b = list[i]
            log(sys.inspect(b))
            a.push('<a href="/bucket?b='+ b.name +'">' + b.name + '</a>')
        }
        res.writeHeader(200, {"Content-Type": "text/html"});
        res.write(
            '<html>'+
            '<head></head>'+
            '<body>'+
            a.join('<br />') +
            '</body>'+
            '</html>'
        );
        res.close();

    })
}


/*
* Display upload form
*/
function display_form(req, res) {
    s3.bucket({}, function(data){
        var a = [], 
            list = data.listallmybucketsresult.buckets.bucket, 
            b;

        for (var i=0; i < list.length; i++) {
            b = list[i]
            a.push('<option value="'+ b.name +'">'+ b.name +'</option>')
        }
        
        res.writeHeader(200, {"Content-Type": "text/html"});
        res.write(
            '<html>'+
            '<head></head>'+
            '<body>'+
            '<a href="/buckets">View buckets</a>' +
            ' | <a href="/create_bucket">Create bucket</a>' +
            '<hr />' +
            '<h3>Upload to Memory and then PUT to S3</h3>' +
            '<form action="/upload" method="post" enctype="multipart/form-data">'+
            'Upload to ' +
            '<select name="b">' +
            a.join('') +
            '</select> / ' +
            '<input type="file" name="upload-file" />'+
            '<input type="submit" value="Upload" />'+
            '</form>'+
            '<h3>Stream Directly to S3</h3>' +
            '<form action="/stream_upload" method="post" enctype="multipart/form-data">'+
            'Upload to ' +
            '<select name="b">' +
            a.join('') +
            '</select> / ' +
            '<input type="file" name="upload-file" />'+
            '<input type="submit" value="Upload" />'+
            '</form>'+            
            '<h3>Save to Disk and Then Stream</h3>' +
            '<form action="/save_then_stream_upload" method="post" enctype="multipart/form-data">'+
            'Upload to ' +
            '<select name="b">' +
            a.join('') +
            '</select> / ' +
            '<input type="file" name="upload-file" />'+
            '<input type="submit" value="Upload" />'+
            '</form>'+
            
            '<h3>Stream to Disk and Then Stream</h3>' +
            '<form action="/stream_disk_stream_upload" method="post" enctype="multipart/form-data">'+
            'Upload to ' +
            '<select name="b">' +
            a.join('') +
            '</select> / ' +
            '<input type="file" name="upload-file" />'+
            '<input type="submit" value="Upload" />'+
            '</form>'+
            '</body>'+
            '</html>'
        );
        res.close();
    })
}
 
/*
* Parsers the request and stores the upload in memory before sending to s3
*/
function upload_file(req, res) {
    // Request body is binary
    req.setBodyEncoding("binary");
    // log(sys.inspect(req))
    var mp = multipart.parse(req), 
        b = req.params.b,
        filedata = req.params['upload-file'],
        filename = req.params['upload-file-filename'],
        content_type = req.params['upload-file-content-type'],
        dt = new Date().valueOf();

        filename = dt + '-' + filename.replace(' ', '-')
        var args = {'bucket': b, 'file':{'name': filename, 'content_type': content_type, 'data': filedata}};
                    
        s3.upload(args, function(data){
            var upload_url = s3.url(b, filename)
            
            log("upload to s3 finished: " + upload_url)
            var response = '<html>'+
                '<head></head>'+
                '<body>'+
                '<img src="'+ upload_url +'" />' +
                '<br />' +
                upload_url + 
                '</body>'+
                '</html>'
                res.writeHeader(200, {
                  "content-type" : "text/html",
                  "content-length" : response.length
                });
                res.write(response);
                res.close();
        })

}

/*
* Parses and streams the upload directly to s3
*/
function stream_upload(req, res) {

    var mp = multipart.parse(req), 
        params = {},
        dt = new Date().valueOf(),
        stream =  s3.stream(s3.config),
        b,
        name,
        filename,
        filetype;
        
    mp.addListener("partBegin", function(part) {
        name = part.name;
        log('---')
        log(name)
        log(part.filename)
        log('---')
        if (name)
            params[name]='';
            if (part.filename != undefined) {
                filename = dt + '-' + part.filename.replace(' ', '-');
                filetype = part.headers['content-type'];
                var args = {'bucket': params['b'], 'file':{'name': filename, 'content_type': filetype}};
                // log('start stream...')
                stream.open(args, function (resp) {
                    // the data listener is only returned if there is an error. todo: sniff the error message
                    resp.addListener("data", function (chunk) {
                        inspect(chunk)
                    });
                    // the end is always reached
                    resp.addListener("end", function() {
                        log('this is the end')
                    });
                })
            }
      });
      
    mp.addListener("body", function(chunk) {
        if (name && filename != undefined) {
            stream.write(chunk);            
        } else {
            params[name] += chunk;
        }
    });
    
    mp.addListener("partEnd", function(part) {
        
        if (part.name == 'upload-file') {
            // log('partend: ' + part.name)
            stream.close()
        }
      });
    
    
    mp.addListener("complete", function() {
        log('complete')
        var upload_url = s3.url(params['b'], filename)
        var s = '<html>'+
            '<head></head>'+
            '<body>'+
            '<img src="'+ upload_url +'" />' +
            '<br />' +
            upload_url + 
            '</body>'+
            '</html>'
            res.writeHeader(200, {
              "content-type" : "text/html",
              "content-length" : s.length
            });
            res.write(s);
            
            // add a slight delay to give the stream time to write to s3.
            setTimeout(function(){
                log('PUT: ' + upload_url);
                res.close();
            }, 500)
            
    })
    
}

/*
* Stores the file in memory, write it to disk, and then streams to s3
* Attempts to throttle the put stream to allow for large files...
* Be advised this isn't perfect. You'll want to test the optimal delay times.
*/
function save_then_stream_upload(req, res) {

    var stream =  s3.stream(s3.config),
        b = req.params.b,
        dt = new Date().valueOf(),
        filedata = req.params['upload-file'],
        filename = dt + '-' + req.params['upload-file-filename'],
        filetype = req.params['upload-file-content-type'];
        
    var path = s3.config.upload_directory + filename;
    fs.writeFile(path, filedata, 'binary', function(err, written){
        if (!err) {
            log('Uploaded: ' + path)
            var fileContent = '',
                file = fs.createReadStream(path);
                
            file.addListener('open', function(fd) {
                var args = {'bucket': b, 'file':{'name': filename,'content_type': filetype}};
                stream.open(args, function (resp) {
                    // log here for error messages
                    resp.addListener("data", function (chunk) {});
                    // the end is always reached
                    resp.addListener("end", function() {
                        sys.puts("this is end... my only friend, the end.");
                    });
                })
                
            })
            file.addListener('error', function(err) {
                throw err;
            })
            file.addListener('data', function(data) {
                file.pause()
                stream.write(data)
                setTimeout(function(){file.resume()}, 200)
            })
            file.addListener('end', function(){
                stream.close()
            })
            file.addListener('close', function() {
                var upload_url = s3.url(b, filename)
                var response = '<html>'+
                    '<head></head>'+
                    '<body>'+
                    '<img src="'+ upload_url +'" />' +
                    '<br />' +
                    upload_url + 
                    '</body>'+
                    '</html>'
                    res.writeHeader(200, {
                      "content-type" : "text/html",
                      "content-length" : response.length
                    });
                    res.write(response);
                            
                    // add a slight delay to give the stream time to write to s3.
                    setTimeout(function(){
                        log('PUT: ' + upload_url);
                        res.close();
                    }, 500)
                
            });
        } // no error saving
    })

}
/*
* Streams the upload to disk and streams to s3.
* Attempts to throttle the put stream to allow for large files...
* Be advised this isn't perfect. You'll want to test the optimal delay times.
*/
function stream_disk_stream_upload(req, res) {
    
    var mp = multipart.parse(req), 
        params = {},
        dt = new Date().valueOf(),
        stream =  s3.stream(s3.config),
        b,
        name,
        filename,
        filetype,
        disk,
        path,
        args;
        
    mp.addListener("partBegin", function(part) {
        name = part.name;
        if (name)
            params[name]='';
            if (part.filename != undefined) {
                filename = dt + '-' + part.filename.replace(' ', '-');
                filetype = part.headers['content-type'];
                //log('stream to disk...')
                path = s3.config.upload_directory + filename;
                disk =  helper.disk(path)
            }
      });
      
    mp.addListener("body", function(chunk) {
        if (name && filename != undefined) {
            //log('disk.write...')
            disk.write(chunk)
        } else {
            params[name] += chunk;
        }
    });
    
    mp.addListener("partEnd", function(part) {
        
        if (part.name == 'upload-file') {
            // log('partend: ' + part.name)
            disk.close()
        }
      });
    
    
    mp.addListener("complete", function() {
        // now that we have the file saved to disk...
        // read and stream to s3
        var file = fs.createReadStream(path);
        file.addListener('open', function(fd) {
            
            args = {'bucket': params['b'], 'file':{'name': filename, 'content_type': filetype}};
            stream.open(args, function (resp) {
                // log here for error messages
                resp.addListener("data", function (chunk) {
                    inspect(chunk)
                });
                // the end is always reached
                resp.addListener("end", function() {
                    log("this is end... my only friend, the end.");
                });
            })
            
        })
        file.addListener('error', function(err) {
            throw err;
        })
        file.addListener('data', function(data) {
            file.pause()
            stream.write(data)
            setTimeout(function(){file.resume()}, 200)
        })
        file.addListener('end', function(){
            stream.close()
        })
        file.addListener('close', function() {
            var upload_url = s3.url(params['b'], filename)
            var response = '<html>'+
                '<head></head>'+
                '<body>'+
                '<img src="'+ upload_url +'" />' +
                '<br />' +
                upload_url + 
                '</body>'+
                '</html>'
                res.writeHeader(200, {
                  "content-type" : "text/html",
                  "content-length" : response.length
                });
                res.write(response);
                        
                // add a slight delay to give the stream time to write to s3.
                setTimeout(function(){
                    log('PUT: ' + upload_url);
                    res.close();
                }, 500)
            
        });
    })    
    

}

/*
* delete a file from an s3 bucket
*/
function delete_file(req, res){

    var filename = '';
    var b = '';
    
    if (req.method == 'GET') {
        filename = req.params.filename;
        b = req.params.bucket;
        res.writeHeader(200, {"Content-Type": "text/html"});
        res.write(
            '<html>'+
            '<head></head>'+
            '<body>'+
            '<h4>Delete Object</h4>'+
            '<form action="/delete" method="post" enctype="multipart/form-data">'+
            '/<input type="hidden" name="bucket" value="'+ b +'" />'+ b +'/'+
            '<input type="text" name="filename" value="'+ filename +'" />'+
            '<input type="submit" value="delete" />'+
            '</form>'+
            '</body>'+
            '</html>'
        );
        res.close();
    };
    
    if (req.method == 'POST') {
        filename = req.params.filename;
        b = req.params.bucket;
        sys.puts('Deleting... /' + b + '/' + filename)
        s3.del({'bucket':b, 'filename': filename}, function(data){
            var msg = 'Success! The file was removed. <a href="/bucket?b='+b+'">Back to '+ b +'</a>'
            if (data != ''){
                msg = sys.inspect(data)
            }
            res.writeHeader(200, {"Content-Type": "text/html"});
            res.write(
                '<html>'+
                '<head></head>'+
                '<body>'+
                msg + 
                '</body>'+
                '</html>'
            );
            res.close();
        })
    };


}

/*
* Handles page not found error
*/
function show_404(req, res) {
    res.writeHeader(404, {"Content-Type": "text/plain"});
    res.write("You r doing it rong!");
    res.close();
}



// "Content-Disposition: form-data; name=\"" + this.name + 
//             "\"; filename=\"" + this.value.filename + "\"\r\n" +
//             "Content-Type: " + this.value.contentType + "\r\n\r\n" + 
//             this.value.data + "\r\n";