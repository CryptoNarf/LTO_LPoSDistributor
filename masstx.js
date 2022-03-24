
/**
 *  Put your settings here, bare minimum:
 *      - node: address of your node in the form http://<ip>:<port>
 *      - apiKey: the API key of the node that is used for distribution
 *
 *  That's it! Enjoy
 */

var config = {
    payoutfileprefix: 'ltoleaserpayouts',
    node: 'http://localhost:6869',
    apiKey: 'your api key'
};

const paymentqueuefile = 'payqueue.dat'
const transactiontimeout = 1500 //Msecs to wait between every transaction posted
const paymentsdonedir = 'paymentsDone/'
const maxmasstransfertxs = 100 //Maximum nr of transactions that fit in 1 masstransfer
const coins = [ "lto" ] //Which coins we take into consideration for masstransfers
const transferfee     = 100000000
const masstransferfee = 10000000
const masstransferversion = 1
const masstransfertype = 11


// THIS CONST VALUE IS NEEDED WHEN THE PAYMENT PROCESS HALTS OR CRASHES
// Just change the batchidstart value to the BatchID that was active when the crash occured,
// and change the transactionstart value to the last succesfull transaction +1.
// And then restart the payment process. That's it. No more changes needed.
// You can leave it as is and do not have to change it back to 0
const crashconfig = {
	batchidstart: '0',
	transactionstart: '0' }

var fs = require('fs');
var request = require('request');
var newpayqueue = []
var jobs

/*
** Method to do some tests before program run any further
** This is the first function that runs
*/
function testcases () {

	if ( !fs.existsSync(paymentsdonedir) ) {
		fs.mkdirSync(paymentsdonedir, 0744) //Create archival DIR
		getpayqueue(start);
	}
	else if ( !fs.existsSync(paymentqueuefile) ) {
		console.log("Missing file " + paymentqueuefile + "! Run collector session first. Goodbye")
	}
	else if ( JSON.parse(fs.readFileSync(paymentqueuefile)).length == 0 ) {
		console.log("Empty payqueue! Nothing to pay, goodbye :-)")
	}
	else {
		getpayqueue(start);
	}
}

/*
** Method to get only the batches from the paymentqueue file that are non-empty (with payouts)
** The batchid's are pushed into a new array
** @callback: returns the batchid
*/
function getnonemptybatches (batchid) {
	batchpaymentarray = JSON.parse(fs.readFileSync(config.payoutfileprefix + batchid + '.json'),toString())
	if ( batchpaymentarray.length == 0 ) {
		console.log("[BatchID " + batchid + "] empty, no payouts!")
		updatepayqueuefile(newpayqueue,batchid)
	}
	return !batchpaymentarray.length == 0 
}

/*
** Method to collect all payouts per batch, read from the payoutfile
** It cycles through the paymentqueue and executes the myfunction,
** which is the function 'start'
** The actual payout transactions are done by the 'start' function
** In the start function transactions are delayed by timer 'transactiontimeout' (1000)
** The timeoutarray ensures that the transactions for the next batch are delayed,
** with the transactiondelay of the previous batches. This is needed because the
** forEach function executes the 'myfunction' as fast as it can, so this will create
** parallel processing.
*/
function getpayqueue (myfunction) {

	var payqueuearray = JSON.parse(fs.readFileSync(paymentqueuefile));
	jobs = payqueuearray.length
	var backuppayqueue = fs.writeFileSync(paymentqueuefile+".bak",fs.readFileSync(paymentqueuefile))	//Create backup of queuefile
	var batchpaymentarray
	var cleanpayqueuearray = payqueuearray.filter(getnonemptybatches)	// This var is the payqueue array without zero pay jobs
	newpayqueue = cleanpayqueuearray
	var txdelay = 0
	var timeoutarray = [];
	timeoutarray[0] = 0;

	cleanpayqueuearray.forEach ( function ( batchid, index ) {  //remark: index in array starts at 0!

                payoutfilename = config.payoutfileprefix + batchid + '.json'
		batchpaymentarray = JSON.parse(fs.readFileSync(payoutfilename),toString())	//All transaction details current batch
		var ltotransactions = 0
		var transactioncount = parseInt(batchpaymentarray.length)	//how many transactions current batch		
		var nrofmasstransfers //How many masstransfers needed for all payments
		var txdelay	//total time needed for all masstransfers in current batch

		batchpaymentarray.forEach( function (asset,index) {
                	ltotransactions++
		})

		nrofmasstransfers = Math.ceil(ltotransactions/maxmasstransfertxs)
		txdelay = nrofmasstransfers*transactiontimeout
		timeoutarray[index+1] = timeoutarray[index] + txdelay

		setTimeout(myfunction, timeoutarray[index], batchpaymentarray, batchid, nrofmasstransfers) 

        }) //End forEach

} //End function getpayqueue

function updatepayqueuefile (array, batchid) {

	jobs-- //Count down everytime a job is done
	
	if ( batchpaymentarray.length == 0 ) { printline = "\nRemoved batch " + batchid + " from the payqueue and successfully updated file " + paymentqueuefile + "!\n" }
	else { printline = "\nAll payments done for batch " + batchid + ". Removed from the payqueue and succesfully updated file " + paymentqueuefile + "!\n" }

	array.shift(console.log(printline)) //Strip batchid from array

		fs.writeFile(paymentqueuefile, JSON.stringify(array), {}, function(err) {
        		if (!err) { } else { console.log("Warning, errors writing payqueue file!\n",err); }
    		});

		fs.renameSync(config.payoutfileprefix + batchid + ".json", paymentsdonedir + config.payoutfileprefix + batchid + ".json")
		fs.renameSync(config.payoutfileprefix + batchid + ".html", paymentsdonedir + config.payoutfileprefix + batchid + ".html")
		fs.renameSync(config.payoutfileprefix + batchid + ".log", paymentsdonedir + config.payoutfileprefix + batchid + ".log")

		console.log("Moved leaserpayoutfiles of batch " + batchid + " to directory " + paymentsdonedir + " for archival purposes.")
		console.log("  - " + config.payoutfileprefix + batchid + ".json => " + paymentsdonedir + config.payoutfileprefix + batchid + ".json")
		console.log("  - " + config.payoutfileprefix + batchid + ".html => " + paymentsdonedir + config.payoutfileprefix + batchid + ".html")
		console.log("  - " + config.payoutfileprefix + batchid + ".log => " + paymentsdonedir + config.payoutfileprefix + batchid + ".log")

		if ( batchpaymentarray.length !== 0 ) {
			console.log("\nAppended payment masstransaction logs to " + config.payoutfileprefix + batchid + ".log for reference.") }

		console.log("\n======================= batch " + batchid + " all done =======================\n")
	
	  	if ( jobs == 0 ) { //Processed all jobs in the payqueue
		        console.log(" Finished payments for all jobs in the payqueue. All done!\n")
                }
}

/**
 * The method that starts the payment process.
 * @params jsonarray the array with the payments of the batch
 * @params queueid the var batchId (number from the payarray)
 * @params nromasstransfers is total masstransfers needed to pay one batchid
 */
var start = function(jsonarray, queueid, nrofmasstransfers) {
    var payments = jsonarray;

    if ( crashconfig.batchidstart == queueid && crashconfig.transactionstart > 0 ) { //start after crash occured
	doPayment(payments, crashconfig.transactionstart, queueid)	//Start payment process after crash occured
    }
    else {	//Start normal payment process
	doPayment(payments, 0, queueid, nrofmasstransfers)
    }
};

/**
 * This method executes the actual masspayment transactions.
 * It will only be done for the Coins defined in the 'const coins = array [  ]'
 * The limit is taken into consideration for the maximum transactions that fit (const maxmasstransfertxs)
 *
 * @param payments: the array of payments (one JSON import of the payment file belonging to a batch)
 * @param counter: the current payment that should be done (not used for now, always 0)
 * @param batchid: the payment batchid number from the payqueue
 * @param nrofmasstransfers: the #masstransfers to be done
**/
var doPayment = function(payments, counter, batchid, nrofmasstransfers) {

	var masstxsdone = 0 //counter to detect when all masstransfers are done for one payment batch
	var payment = {} //Payment object with all transactions for lto
	var masstxarray = [] //array with all transactions for 1 masstransfer
        var masstxpayment = {} //JSON object used for actual payment POST
	var decimalpts //how many decimals for a token
	var delayarray = [] //array to set timeout time related to all transactions to be done
	var logobject = "" //object to add to batchlogfile
	var transfercostbatch = 0 //transfercost for all masstransfers in a batch
        delayarray[0] = 0 //timeout for first asset will be zero

	masstransferobject(payments, function(cb) { payment = cb })      //VAR to construct masstransfer array, callback array with all transactions

	coins.forEach( function (asset,index) {

		if ( asset in payment ) { //Found relevant coin in payment object

			var assettxs = payment[asset] //Array with all transactions
			var totaltxs = assettxs.length //Total number of transactions for one asset
			var masstransfers = Math.ceil(totaltxs/maxmasstransfertxs) //How many masstransfers needed for all payments
			var transactiondelay = masstransfers*transactiontimeout //total time needed for all masstransfers current asset
			var ii = 0 //Counter for all transactions

			delayarray[index+1] = delayarray[index] + transactiondelay //Set timeout for next asset

			setTimeout( function() { //Start function actions for an Asset

				var assetamount = 0
				var masstransfercounter = masstransfers
				var loop = totaltxs
				var onemasstransferamount
				var assetId = ''
				var masstransfercounterup = 0
				var logmessage

				if ( asset == 'lto' ) { decimalpts = 8 }
 				if ( asset !== 'lto' ) { var assetId = payment["Common"][asset + "assetId"] }

				var masstransactionpayment = {
 								"version": masstransferversion,
								"type": masstransfertype,
								"sender": payment.Common.sender
				}

				if ( asset !== 'lto' ) { masstransactionpayment.assetId = assetId } //Add assetId to json if asset is NOT lto

				assettxs.forEach(function (asset) { assetamount += asset.amount }) //How much fees total for an asset

				if ( asset == 'lto' ) { var text = "fee rewards" } else { var text = asset }

				logmessage = "[BatchID " + batchid + "] Found " + totaltxs + " '" + asset + "' transactions, total " + assetamount/Math.pow(10,decimalpts) +
                                            " " + text + ", will do " + masstransfers + " masstransfers."

				logobject += logmessage + "\n"

				console.log(logmessage)

				for ( var cnt = 0; cnt < masstransfers; cnt++ ) { //Loop through all masstransfers for one asset

					masstxarray = []
					onemasstransferamount = 0
					timeout = cnt*transactiontimeout //timeout for masstransfers

					setTimeout ( function () { //Start function masstransfers

						if ( loop > maxmasstransfertxs ) { loop = maxmasstransfertxs } 

						for ( var i = 0; i < loop; i++ ) { //Loop trough all transactions, max 'const masstransfer or #txs if 1 masstransfer

							masstxarray.push(assettxs[ii]) //cycle through all transactions
							onemasstransferamount += assettxs[ii].amount //how many fees in one masstransfer
							ii++ //counter for all transactions
						}

						masstransactionpayment['transfers'] = masstxarray //add transactions to payment json object
						masstransfercounter-- //For breaking the for loop
						masstransfercounterup++
						masstransfercost = transferfee + (masstransferfee * masstxarray.length)
						masstransactionpayment.fee = masstransfercost //Add fee to masstransfer json object

						if ( totaltxs > maxmasstransfertxs ) { //calc number of transactions for last masstransfer
							if ( masstransfercounter == 1 ) { loop = totaltxs - (masstransfers-1)*maxmasstransfertxs }
						}
						if ( masstransfers == 1 ) { timeout = 0 } else { timeout = transactiontimeout }

						//Put here the actual POST function for a masstransfer
            request.post({
              url: config.node + '/transactions/sign',
              json: masstransactionpayment,
              headers: {"Accept": "application/json", "Content-Type": "application/json", "X-API-Key": config.apiKey}
            }, function (err, res) {
              if (err || res.body.error) {
                const error = err || res.body;

                console.log(error);
                return;
              }

              request.post({
                url: config.node + '/transactions/broadcast',
                json: res.body,
                headers: {"Accept": "application/json", "Content-Type": "application/json"}
              }, function (err, res) {

                if (err || res.body.error) {
                  const error = err || res.body;

                  console.log(error);
                  return;
                }

                logmessage = "         " + batchid + "] - masstransfer " + masstransfercounterup +
                  " for " + asset + " done! Send " + onemasstransferamount / Math.pow(10, decimalpts) +
                  " " + asset + " with " + masstxarray.length + " transactions in it." +
                  " Cost " + masstransactionpayment.fee / Math.pow(10, 8)

                console.log(logmessage)

                logobject += logmessage + "\n"
                masstxarray = []
                onemasstransferamount = 0
                masstxsdone++
                transfercostbatch += masstransactionpayment.fee / Math.pow(10, 8)

                if (masstxsdone == nrofmasstransfers) { //Finished all masstransfers for one batch!

                  console.log("\nTotal masstransfercosts: " + transfercostbatch + " lto.")

                  fs.appendFileSync(config.payoutfileprefix + batchid + ".log",
                    "\n======= masstx payment log [" + (new Date()) + "] =======\n" + logobject +
                    "\nTotal masstransfercosts: " + transfercostbatch + " lto.\n" +
                    "All payments done for batch " + batchid + ".\n")

                  updatepayqueuefile(newpayqueue, batchid)
                }
              });
            });
					}, timeout) //End function masstransfers
				} //End for all masstransfers loop
			}, delayarray[index]) //End function actions for an Asset
		} //End if ( asset in payment )
	}) //End loop coins.forEach
} //End var doPayment

/* This var will create the masstransferarray for lto
 * @param paymentarray: the array with all lease recipients with amounts
 * @param cb: the array transfers is returned to the caller
*/
var masstransferobject = function (paymentarray, cb) {
	var transfers = {}
	var lto = 'lto'
	var common = 'Common'
	var ltoamount = 0

	transfers[common] = {}
	transfers[lto] = []	//empty array where we will push lto recipients and amounts

	paymentarray.forEach (function(asset, index) {

		if ( asset.sender ) { if ( !transfers[common].sender == true ) { transfers[common].sender = asset.sender } }

		if ( !asset.assetId ) { //No assetId means found lto transaction

			var ltodata = {	"recipient" : asset.recipient,
						"amount" : asset.amount }

			ltoamount += asset.amount
			transfers[common].ltoamount = ltoamount
			transfers[lto].push(ltodata)

		} 
	})
	cb(transfers);
//console.log(transfers)
}

testcases();
