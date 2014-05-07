# Backbone-WebSQL

Implementation of Backbone.sync to store data to WebSQL (available on webkit-based browsers).

# How to run the tests

* Start a server in the root (`$ http-server -c-1`)
* Navigate to test/index.html (`http://localhost:8080/test/index.html`)

# Model select by column
Select from table with certain value in column
```javascript
var model = new Model({ model: 'Audi' });
model.fetch({
    success: onSuccess,
    error: onError
});

# Collection select options
Select from table with certain value in column
```javascript
collection.fetch({
    filters: {
        id: [1,2,3,4]
    },
    success: onSuccess,
    error: onError
});
```
Limit select results
```javascript
collection.fetch({
    limit: 1,
    success: onSuccess,
    error: onError
});
```
Order results by date
```javascript
collection.fetch({
    orderby: 'date',
    ordertype: 'desc',
    success: onSuccess,
    error: onError
});
```

With polite thanks to [Smarcoms web services s.r.o.](http://www.smarcoms.cz)