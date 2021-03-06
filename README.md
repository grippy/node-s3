## What is it?

node-s3 is a simple web application for creating and manipulating buckets and files on Amazon Web Services S3. With slight modifications, you can also use it to proxy file uploads directly to AWS.

This basis for this little app was, in part, inspired by:
http://rfw.posterous.com/how-nodejs-saved-my-web-application

The above link should hopefully provide some insight on how this app might be useful.

## Requirements
* **bastard samurai** http://www.youtube.com/watch?v=TZuo3ryNFPk
* **nodejs** = 0.1.33 (tested on 0.1.33)

## Configuration 

Just edit `config.jsq and place your own configuration values into each of the possible environment variables.

    var dev = {
      ports:[8000],
      s3:{
          key: "somekeyfordevelopment",
          secret: "somesecretfordevelopment",
          reviewer: "bastard@samurai.com",
          upload_directory:'./tmp/' // relative to the app root
      }
    }

    var prod = {
      ports:[8000],
      s3:{
          key: "somekeyforproduction",
          secret: "somesecretforproduction",
          reviewer: "bastard@samurai.com",
          upload_directory:'./tmp/'
      }
    }

If you need to create additional environment variable options, then remember to modify the config#init function accordingly. The port value is an array so you can define multiple ports to listen on. When the application starts, it will create a new app instance per port.

## Fire It Up, Man 

To fire up the application on each of the designated port options:

    node app.js --env=[env option (defaults to dev)]

## Upload Options

/upload (parses and loads the uploaded file in memory before putting to s3)
/stream_upload (parses and streams to s3)
/save_then_stream_upload (stores in memory, writes to disk, and then streams the file to s3.)
/stream_save_stream_upload (streams the file to disk and then streas the file to s3)

## Notes

* Chunked encoding isn't supported by s3.

* I experience the following error when trying to stream large files (>10MB) to s3. Not exactly sure what the problem is. 

    TypeError: Cannot call method 'flush' of undefined
      at Client.<anonymous> (http:514:20)
      at node.js:810:9

* Future Improvements

* The views are baked into the controller action responses. I may consider porting this to http://github.com/visionmedia/express

* Uploading to s3 assumes the filedata is binary.

## Wax It, Flip It, Rub It Down
If you find this app useful please tweak it to your hearts content. If you feel like sharing your modifications, please do.
