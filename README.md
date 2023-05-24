
# Introduction
This library offers a solution to manage a cache via Redis for the [ES4X Runtime](https://github.com/reactiverse/es4x).

Right now you:
- **set / get**
- **set / get multiple values at the same time**
- **delete**

# Usage
## Add dependency
For now just add the Github url to your dependencies in the **package.json** file:
```
"dependencies": {
	"@vertx/core": "4.1.0",
	"@vertx/web": "4.2.5",
	"@vertx/web-client": "4.2.5",
	"es4x-cache": "git+https://github.com/omnislash-com/es4x-cache.git#main"
}
```

## Import the CacheManager class to your code
Import the class directly from the package like this:
```
import { CacheManager } from 'es4x-cache/src/CacheManager';
```

## Create an instance
You only need to create one instance of the cache manager. You do so by doing the following:
```
let	hostUrl = "redis://:key@ip:port/1";
let	cache = await CacheManager.Create(vertx, hostUrl);
if (cache != null)
{
	console.log("Cache created!");
}
```

## Set a value with an expiration time
To write a value to the cache with an expiration time, you can just do the following:
```
let	category = "mygroupofobjects";
let	key = "mykey";
let	value = "value to save";
let	expiration = 60;
let	ok = await cache.set(category, key, value, expiration);
if (ok == true)
{
	console.log("All good!");
}
```

# Testing
In order to run the tests you need to copy the file:
```
tests/test_config_example.json
```
To
```
tests/test_config.json
```
Then fill is with your Redis information information and test data.
