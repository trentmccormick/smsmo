/* Meteor methods to load early*/

if (Meteor.isServer){

	var client = new Twilio({
      from: Meteor.settings.TWILIO.FROM,
      sid: Meteor.settings.TWILIO.SID,
      token: Meteor.settings.TWILIO.TOKEN
 	});

	Meteor.methods({
		'get_venmo_friends': function() {
			this.unblock(); //allows other Methods to run, since I'm doing HTTP.get() synchronously
			var user = Meteor.user();
			if (!user) {
				throw new Meteor.Error("Couldn't retrieve Venmo friends; user is not logged in.");
			}
			var venmo_id = user.services.venmo.id;
			var access = user.services.venmo.accessToken;
			var url = "https://api.venmo.com/v1/users/" + venmo_id + "/friends";
			try {
				var result = HTTP.get(url, {"params": {"access_token": access, "limit": 2000}});
				return result.data.data;
			} catch (e) {
				console.log(e);
				throw new Meteor.Error("Error with GET");
			}
		},
		'after_login': function() {
			/* Update the user's friend list */
			Meteor.call('get_venmo_friends', function(err, res) {
				if (err) {
					throw new Meteor.Error("Unable to retrieve Venmo friends.");
				}
				Friends.upsert(Meteor.userId(), {$set: {'venmo_friends': res}});
			});
		},
		'add_phone': function(userId, num) {
			Meteor.users.update({_id: userId}, {$set: {'phone': num}});
		},
		'send_welcome': function(num){
			var num = '+1' + num;
			client.sendSMS({
  				to: num,
  				body: 'Welcome to SMSmo. Reply to this number with a name and amount to make a payment'
			});
		},
		'handleTwilioResponse': function(phone, msg){
			var phone = phone.substr(2);
			var user = Meteor.users.findOne({"phone": phone});
			if (!user) {
				client.sendSMS({
	  				to: phone,
	  				body: "We're sorry. We could not find you in our system. Please visit smsmo.meteor.com to sign up"
				});
				throw new Meteor.Error("Couldn't find a user!");
			}
			var access_token = user.services.venmo.accessToken;

			var msgArray = msg.split(' ');
			if (msgArray.length != 3 && msgArray.length != 4){
				client.sendSMS({
	  				to: phone,
	  				body: 'Invalid submission. Please use the the form "Send friend_name amount"'
				});
				throw new Meteor.Error("Invalid message")
			}
			var code = msgArray[0]; // only supports send atm

			if (msgArray.length == 4){
				var name = msgArray[1] + ' ' + msgArray[2];
				var amt = parseFloat(msgArray[3])
			} else {
				var name = msgArray[1];
				var amt = parseFloat(msgArray[2])
			}

			var friends = Friends.findOne(user._id).venmo_friends;
			var friend = friends.filter(function(obj){
				return obj.display_name === name || obj.first_name === name;
			});

			if (friend.length === 1){
				// add code to send message back to user
				friend_id = friend[0].id;
			} else if (friend.length == 0){
				client.sendSMS({
	  				to: phone,
	  				body: 'Could not find Venmo friend'
				});
				throw new Meteor.Error("Could not find Venmo friend. Please try again.");
			} else {
				client.sendSMS({
					to: phone,
					body: 'More than one Venmo friend found under ' + name
				});
				throw new Meteor.Error("Need more information about name");
			}

			Meteor.call('user_pay_user', access_token, friend_id, amt, msg, function (err, res){
				if (err) {
					client.sendSMS({
						to:phone,
						body: 'Error with making payment'
					})
				} else {
					client.sendSMS({
						to:phone,
						body: 'Successful payment to ' + name
					})
				}
			});
		},
		'user_pay_user': function(access, venmo_id, amount, msg) {
			var url = "https://api.venmo.com/v1/payments";
			var req = HTTP.call("POST", url, 
								{params: {access_token: access, user_id: venmo_id, note: msg, amount: amount}},
								function(error, result){
									if(error){
										console.log(error);
										throw new Meteor.Error("Error with POST");
									} else {
										console.log(result);
										return result;
									}
								});
		},
		'pay_sandbox': function() {
			var user = Meteor.users.findOne({});
			if (!user) {
				throw new Meteor.Error("Couldn't find a user!");
			}
			var venmo_id = "145434160922624933";
			var access = user.services.venmo.accessToken;
			var url = "https://sandbox-api.venmo.com/v1/payments";
			var req = HTTP.call("POST", url, 
								{params: {access_token: access, user_id: venmo_id, note: "test", amount: 0.1}},
								function(error, result){
									if(error){
										console.log(error);
										throw new Meteor.Error("Error with POST");
									} else {
										console.log(result);
										return result;
									}
								});

		}

	});
}
