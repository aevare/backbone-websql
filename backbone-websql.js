(function (root){
    var factory = 
    (function( Backbone ) {
        // ====== [UTILS] ======
        //Select object by dot notation
        function getDescendantProp(obj, desc) {
            var arr = desc.split(".");
            while(arr.length && (obj = obj[arr.shift()]));
            return obj;
        }
        //function for generating "random" id of objects in DB
        function S4() {
           return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
        }

        // Generate a pseudo-GUID by concatenating random hexadecimals
        //  matching GUID version 4 and the standard variant.
        var VERSION_VALUE = 0x4;// Bits to set
        var VERSION_CLEAR = 0x0;// Bits to clear
        var VARIANT_VALUE = 0x8;// Bits to set for Standard variant (10x)
        var VARIANT_CLEAR = 0x3;// Bits to clear
        function guid() {
            var data3_version = S4();
            data3_version = (parseInt( data3_version.charAt( 0 ), 16 ) & VERSION_CLEAR | VERSION_VALUE).toString( 16 )
                + data3_version.substr( 1, 3 );
            var data4_variant = S4();
            data4_variant = data4_variant.substr( 0, 2 )
                + (parseInt( data4_variant.charAt( 2 ), 16 ) & VARIANT_CLEAR | VARIANT_VALUE).toString( 16 )
                + data4_variant.substr( 3, 1 );
            return( S4() + S4() + '-' + S4() + '-' + data3_version + '-' + data4_variant + '-' + S4() + S4() + S4());
        }

        // ====== [ WebSQLStore ] ======
        Backbone.WebSQLStore = window.WebSQLStore = function (db, tableName, columns, initSuccessCallback, initErrorCallback) {
            // make columns optional for backwards compatibility w/ original API
            if (typeof columns == 'function') {
                initErrorCallback = initSuccessCallback;
                initSuccessCallback = columns;
                columns = null;
            }

            this.tableName = tableName;
            this.db = db;
            this.columns = columns || [];
            var success = function (tx,res) {
                if(initSuccessCallback) initSuccessCallback();
            };
            var error = function (tx,error) {
                console.error("Error while create table",error);
                if (initErrorCallback) initErrorCallback();
            };
            //db.transaction (function(tx) {
            //  tx.executeSql("CREATE TABLE IF NOT EXISTS `" + tableName + "` (`id` unique, `value`);",[],success, error);
            //});
            var colDefns = ["`id` unique", "`value`"];
            colDefns = colDefns.concat(this.columns.map(createColDefn));
            this._executeSql("CREATE TABLE IF NOT EXISTS `" + tableName + "` (" + colDefns.join(", ") + ");",null,success, error, {});
        };
        Backbone.WebSQLStore.debug = false;
        Backbone.WebSQLStore.insertOrReplace = false;

        _.extend(Backbone.WebSQLStore.prototype,{
            create: function (model,success,error,options) {
                //when you want use your id as identifier, use apiid attribute
                if(!model.attributes[model.idAttribute]) {
                    // Reference model.attributes.apiid for backward compatibility.
                    var obj = {};

                    if(model.attributes.apiid){
                        obj[model.idAttribute] = model.attributes.apiid;
                        delete model.attributes.apiid;
                    }else{
                        obj[model.idAttribute] = guid();
                    }            
                    model.set(obj);
                }

                var colNames = ["`id`", "`value`"];
                var placeholders = ['?', '?'];
                var params = [model.attributes[model.idAttribute], JSON.stringify(model.toJSON())];
                this.columns.forEach(function(col) {
                    colNames.push("`" + col.name + "`");
                    placeholders.push(['?']);
                    params.push(
                        col.selector ? getDescendantProp(model.attributes, col.selector) : model.attributes[col.name]
                        );
                });
                var orReplace = Backbone.WebSQLStore.insertOrReplace ? ' OR REPLACE' : '';
                this._executeSql("INSERT" + orReplace + " INTO `" + this.tableName + "`(" + colNames.join(",") + ")VALUES(" + placeholders.join(",") + ");", params, success, error, options);
            },
            
            destroy: function (model, success, error, options) {
                //console.log("sql destroy");
                var id = (model.attributes[model.idAttribute] || model.attributes.id);
                this._executeSql("DELETE FROM `"+this.tableName+"` WHERE(`id`=?);",[model.attributes[model.idAttribute]],success, error, options);
            },
            
            find: function (model, success, error, options) {
                var id = (model.attributes[model.idAttribute] || model.attributes.id);
                this._executeSql("SELECT `id`, `value` FROM `"+this.tableName+"` WHERE(`id`=?);",[id], success, error, options);
            },

            findByColumn: function (model, success, error, options, column) {
                var param = model.attributes[column.name];
                this._executeSql("SELECT `id`, `value` FROM `"+this.tableName+"` WHERE(`"+ column.name +"`=?);",[param], success, error, options);
            },
            
            findAll: function (model, success, error, options) {
                var params = [],
                    sql = "SELECT `id`, `value` FROM `"+this.tableName+"`";
                
                if (options.filters) {
                    if (typeof options.filters == 'string') {
                        sql += ' WHERE ' + options.filters;
                    }
                    else if (typeof options.filters == 'object') {
                        sql += ' WHERE ' + Object.keys(options.filters).map(function(col) {
                            if(options.filters[col] instanceof Array){
                                var q = "", i, filterArr = options.filters[col];
                                for (i in filterArr){
                                    q += (q == "" ? "" : ", ") + "?";
                                    params.push(filterArr[i]);
                                }
                                return '`' + col + '` IN (' + q + ')';  
                            }
                            else {
                                params.push(options.filters[col]);
                                return '`' + col + '` = ?';
                            }
                        }).join(' AND ');
                    }
                    else {
                        throw new Error('Unsupported filters type: ' + typeof options.filters);
                    }
                }
                if(options.orderby){
                    sql += " order by " + options.orderby;
                    sql += options.ordertype ? ' ' + options.ordertype : ' desc';
                }
                if(options.limit){
                    sql += " limit " + options.limit;// + " `id`, `value` FROM `"+this.tableName+"`"
                }
                this._executeSql(sql, params, success, error, options);         
            },
            
            update: function (model, success, error, options) {
                if (Backbone.WebSQLStore.insertOrReplace)
                    return this.create(model, success, error, options);

                //console.log("sql update")
                var id = (model.attributes[model.idAttribute] || model.attributes.id);

                var setStmts = ["`value`=?"];
                var params = [JSON.stringify(model.toJSON())];
                this.columns.forEach(function(col) {
                    setStmts.push("`" + col.name + "`=?");
                    params.push( 
                        col.selector ? getDescendantProp(model.attributes, col.selector) : model.attributes[col.name]
                        );
                });
                params.push(model.attributes[model.idAttribute]);
                this._executeSql("UPDATE `"+this.tableName+"` SET " + setStmts.join(", ") + " WHERE(`id`=?);", params, function(tx, result) {
                    if (result.rowsAffected == 1){
                        success(tx, result);
                    } else {
                        error(tx, new Error('UPDATE affected ' + result.rowsAffected + ' rows'));
                    }
                }, error, options);
            },
            
            _save: function (model, success, error) {
                //console.log("sql _save");
                var id = (model.attributes[model.idAttribute] || model.attributes.id);
                this.db.transaction(function(tx) {
                    tx.executeSql("");
                });
            },
            
            _executeSql: function (SQL, params, successCallback, errorCallback, options) {
                var success = function(tx,result) {
                    if(Backbone.WebSQLStore.debug) {console.log(SQL, params, " - finished");}
                    if(successCallback) successCallback(tx,result);
                };
                var error = function(tx,error) {
                    if(Backbone.WebSQLStore.debug) {console.error(SQL, params, " - error: " + error)};
                    if(errorCallback) return errorCallback(tx,error);
                };
                
                if (options.transaction) {
                    options.transaction.executeSql(SQL, params, success, error);
                }
                else {
                    this.db.transaction(function(tx) {
                        tx.executeSql(SQL, params, success, error);
                    });
                }
            }
        });

        // ====== [ Backbone.sync WebSQL implementation ] ======
        Backbone.WebSQLStore.sync = window.WebSQLStore.sync = Backbone.localSync = function (method, model, options) {
            var store = model.store || model.collection.store, 
                isSingleResult = false,
                columnName,
                success, 
                error;
            
            if (store == null) {
                console.warn("[BACKBONE-WEBSQL] model without store object -> ", model);
                return;
            }
            
            success = function (tx, res) {
                var len = res.rows.length,result, i;
                if (len > 0) {
                    result = [];

                    for (i=0;i<len;i++) {
                        result.push(JSON.parse(res.rows.item(i).value));
                    }
                    if(isSingleResult && result.length!==0){
                        result = result[0];
                    }
                } 
                
                options.success(result);
            };
            error = function (tx,error) {
                console.error("sql error");
                console.error(error.message);
                console.error(tx);
                options.error(error);
            };
            
            switch(method) {
                case "read":
                    if(model.attributes && model.attributes[model.idAttribute]){
                        isSingleResult = true;
                        store.find(model,success,error,options)
                    } else if(model.attributes && (columnName = checkFilledColumns.call(this, model))) {
                        isSingleResult = true;
                        store.findByColumn(model, success, error, options, columnName);
                    }else{
                        store.findAll(model, success, error, options)
                    }           

                    break;
                case "create":  store.create(model,success,error,options);
                    break;
                case "update":  store.update(model,success,error,options);
                    break;
                case "delete":  store.destroy(model,success,error,options);
                    break;
                default:
                    console.error(method);
            }       
        };

        var checkFilledColumns = function(model){
                if(this.store.columns && this.store.columns.length){
                    return _.find(this.store.columns, function(column){
                        return !!model.attributes[column.name];
                    });
                }
                return false;
            },
            typeMap = {
                "number": "INTEGER",
                "string": "TEXT",
                "boolean": "BOOLEAN",
                "array": "LIST",
                "datetime": "TEXT",
                "date": "TEXT",
                "object": "TEXT"
            },
            createColDefn = function(col) {
                if (col.type && !(col.type in typeMap))
                    throw new Error("Unsupported type: " + col.type);

                var defn = "`" + col.name + "`";
                if (col.type) {
                    if (col.scale)
                        defn += " REAL";
                    else
                        defn += " " + typeMap[col.type];
                }
                return defn;
            };
        
        Backbone.ajaxSync = Backbone.sync;

        Backbone.getSyncMethod = function(model) {
            if(model.store || (model.collection && model.collection.store)) {
                return Backbone.localSync;
            }

            return Backbone.ajaxSync;
        };

        // Override 'Backbone.sync' to default to localSync,
        // the original 'Backbone.sync' is still available in 'Backbone.ajaxSync'
        Backbone.sync = function(method, model, options) {
          return Backbone.getSyncMethod(model).apply(this, [method, model, options]);
        };
        
        return WebSQLStore;
    })
    
    if (typeof exports !== 'undefined')
    {
        factory(require('backbone'));
    }
    else if (typeof define === 'function' && define.amd)
    {
        define(['backbone'], factory);
    }
    else
    {
        root.WebSQLStore = factory(root.Backbone)
    }
})(this)