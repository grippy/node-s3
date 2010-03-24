var dev = {
  ports:[8000],
  s3:{
      key: 'key',
      secret: 'secret',
      reviewer: 'bastard@samurai.com',
      upload_directory:'./tmp/'
  }
}

var prod = {
  ports:[8000],
  s3:{
      key: 'key',
      secret: 'secret',
      reviewer: 'bastard@samurai.com',
      upload_directory:'./tmp/'
  }
}

/* initialized config */
var _base = null;

exports.base = function(){
    return _base
}

exports.init = function(env) {
    switch (env) {
        case 'dev':
            _base = dev;
            break
        case 'prod':
            _base = prod;
            break
        default:
            _base = dev;
            break
    }
    
}
