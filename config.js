var dev = {
  ports:[8000],
  s3:{
      bucket: "myawesomebucket-dev",
      key: "somekeyfordevelopment",
      secret: "somesecretfordevelopment",
      reviewer: "bastard@samurai.com"
  }
}

var prod = {
  ports:[8000],
  s3:{
      bucket: "myawesomebucket-prod",
      key: "somekeyforproduction",
      secret: "somesecretforproduction",
      reviewer: "bastard@samurai.com"
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
