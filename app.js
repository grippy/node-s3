var http = require("http"),
    url = require("url"),
    multipart = require("multipart"),
    sys = require("sys"),
    events = require("events"),
    fs = require("fs"),
    s3 = require("./aws/s3"),
    config = require('./config'),
    b64 = require('./aws/crypto/base64');

/* globals */
var env = null

function log(s){sys.puts(s)}
function debug(s){sys.debug(s)}
function inspect(s){sys.inspect(s)}
function str(v){return (v != undefined) ? v : '' }

function app(){
    return http.createServer(function(req, res) {
            // Simple path-based request dispatcher
            log(req.method + ' http://' + req.headers.host + req.url)
            switch (url.parse(req.url).pathname) {
                case '/':
                    display_form(req, res);
                    break;
                case '/upload':
                    upload_file(req, res);
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
        if (name) params[name] = "";
        
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
var bucket = config.base().s3.bucket

// init server
start()

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
            if (truncated){
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
    
    res.writeHeader(200, {"Content-Type": "text/html"});
    res.write(
        '<html>'+
        '<head></head>'+
        '<body>'+
        '<a href="/buckets">View buckets</a>' +
        ' | <a href="/create_bucket">Create bucket</a>' +
        '<hr />' +
        '<form action="/upload" method="post" enctype="multipart/form-data">'+
        'Upload to ' +
        s3.url(bucket) + 
        '<input type="file" name="upload-file" />'+
        '<input type="submit" value="Upload" />'+
        '</form>'+ 
        '</body>'+
        '</html>'
    );
    res.close();
}
 
/*
* Handle file upload
*/
function upload_file(req, res) {
    // Request body is binary
    req.setBodyEncoding("binary");
    // log(sys.inspect(req))
    var mp = multipart.parse(req), 
        chunks = [],
        fields = {}, 
        name, 
        filename, 
        content_type;

    mp.addListener("partBegin", function (part) {
        // log(part.name)
        // log(part.filename)
        // log(content_type)
        // log(sys.inspect(part.boundary))
        content_type = part.headers['content-type']
        name = part.name;
        filename = part.filename.replace(' ', '-');
        // if (name) fields[name] = "";
        
      });
    mp.addListener("body", function (chunk) {
        if (name) {
          // if (fields[name].length > 1024) return;
          // fields[name] += chunk;
          chunks.push(chunk)
        }
    });
    
    mp.addListener("complete", function() {
        // remember, this process only shows one file upload. adjust accordingly.
        // options: streaming to disk first, then write to s3 in the callback (copy the s3 call below).
        // var path = "./uploads/" + filename
        // fs.writeFile(path, chunks.join(''), 'binary', function(err, written){
        //     log('binary gods obey')
        // })
        // streaming to s3
        filename = Math.floor((Math.random() * 1024)).toString() + '_' + filename
		var file = {'name': filename, 'content_type': content_type, 'data': chunks.join('')};
		var args = {'bucket': bucket, 'file':file};

		s3.upload(args, function(data){
		    log("upload to s3 finished")
            var response = '<html>'+
                '<head></head>'+
                '<body>'+
                '<img src="'+ s3.url(bucket, filename) +'" />' +
                '</body>'+
                '</html>'
                res.writeHeader(200, {
                  "content-type" : "text/html",
                  "content-length" : response.length
                });
                res.write(response);
                res.close();
		})
    })    
}

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