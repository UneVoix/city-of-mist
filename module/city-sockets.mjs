import {SocketInterface, MasterSession, SlaveSession} from "./sockets.mjs";
import {CityDialogs} from "./city-dialogs.mjs";
import {JuiceMasterSession, JuiceSlaveSession, TagReviewMasterSession, TagReviewSlaveSession, DummyMasterSession, DummySlaveSession, JuiceSpendingSessionM, JuiceSpendingSessionS} from "./city-sessions.mjs"

export class CitySockets {

	static timeoutDuration =  60; //time in seconds

	static codes = {
		startRoll: "startRoll",
		onPreRoll : "onPreRoll",
		giveJuice : "giveJuice",
		tagVerify: "tagVerify",
		requestJuiceTime: "requestJuiceTime",
	}


	static init() {
		this.sockets = new SocketInterface("system.city-of-mist");
		this.sockets.addSlaveSessionConstructor(DummyMasterSession, DummySlaveSession);
		this.sockets.addSlaveSessionConstructor(JuiceMasterSession, JuiceSlaveSession);
		this.sockets.addSlaveSessionConstructor(JuiceSpendingSessionM, JuiceSpendingSessionS);
		this.sockets.addSlaveSessionConstructor(TagReviewMasterSession, TagReviewSlaveSession);
	}

	static async test() {
		return this.execSession( new DummyMasterSession())
	}

	static async execSession(session) {

		return this.sockets.execSession(session);
	}


	static async send(typeStr , dataObj = {}) {
		if (!this.sockets)
			throw new Error(" Sockets not initialized, make sure to run CitySockets.init()");
		return await this.sockets.send(typeStr, dataObj);
	}

	/** Send to other clients when you are in the pre-roll step, deciding on modifiers, allowing them to choose juice and other stuff
argument is object containing rollData TODO
*/
	static async declareRoll(rollData) {
		await this.send(this.codes.onPreRoll, rollData);
		const otherUsers = game.users
			.filter(user=> user !== game.user);
		this.awaiters.preRollGo = this.#createNewPromiseData(otherUsers, Infinity);
		const awaiters = this.awaiters.preRollGo;
		return function pending() {
			return awaiters.filter( x=> x.pending).map( x=>x.user);
		}
	}

	/** returns when all players have checked in on their contribution to the roll
	*/
	static async awaitRollReply() {
		return await this.#awaitResolution(this.awaiters.preRollGo);
	}

	static #createNewPromiseData(userArr, gmTimeOut = this.timeoutDuration, playerTimeOut=this.timeoutDuration) {
		return userArr.map(user => {
			const data = {
				pending: true,
				value: null,
				user,
				userId: user.id,
				timeout: user.isGM ? gmTimeOut : playerTimeOut,
				error: null,
				promise : null,
				conf: null,
				reject: null,
			};
			const promise =
				 new Promise ( (conf, reject) => {
					data.conf = conf;
					data.reject = reject;
					window.setTimeout(() => this.timeoutFn(data, reject) , 1000);
				}).then( val => {
					data.pending = false, data.value= val;
				}).catch( err=> {
					data.pending = false; data.value = null; data.error = err;
				});
			data.promise = promise;
			return data;
		});
		}

	static async #awaitResolution(promiseDataArr) {
		const promises = promiseDataArr.map( x=> x.promise);
		await Promise.allSettled( promises);
		return promiseDataArr.filter( x=> x.value !== null);
	}

	static timeoutFn(dataObj, reject) {
		if (dataObj.pending === false)
			return; //promise is resolved elsewhere
		if (dataObj.timeout <= 0) {
			reject("timeout");
			return;
		} else {
			dataObj.timeout-= 1;
			window.setTimeout( () => CitySockets.timeoutFn(dataObj, reject), 1000);
		}
	}


	/** send Juice to the actor juiceData is {
		amount: number,
		giverId: actorId
		}
	*/
	static async sendJuice(juiceData = {amount: 0}) {
		return await this.send(this.codes.giveJuice, juiceData)
	}

	/** Called to set a gien users promise data done, internal function only */
	static #setDone(promiseData, userId, promiseReturn) {
		const data = promiseData.find(o => o.userId == userId);
		if (!data) throw new Error(`Couldn't find ${userId} in promise data`);
		data.conf(promiseReturn);
	}

	static async onPreRollHandler(dataObj, metaData) {
		const user = game.users.find(user => user.id == metaData.senderId);
		if (game.user.isGM) {
			// const verify = await CityDialogs.tagVerify(dataObj);
			const verify = {amount : 1}; //test code
			return await this.send(this.codes.tagVerify, verify);
		} else {
			console.log("Trying to get help hurt");
			const juice = await CityDialogs.getHelpHurt(dataObj);
			// const juice = {amount : 1}; //test code
			return await this.send(this.codes.giveJuice, juice);
		}
	}

	static async requestJuiceExtendTimeOut( actor, amount = 0) {
		await this.send( this.codes.requestJuiceTime , {
			actorId: actor.id,
			actorName : actor.name,
			amount
		});
	}

	static async onTagVerify(dataObj, metaData) {
		this.#setDone(this.awaiters.preRollGo, metaData.senderId, dataObj);
	}

	static async onGiveJuice(dataObj, metaData) {
		this.#setDone(this.awaiters.preRollGo, metaData.senderId, dataObj);
	}

}


// class RollSession extends Session {
// 	static codes = {
// 		startRoll: "startRoll",
// 		onPreRoll : "onPreRoll",
// 		giveJuice : "giveJuice",
// 		tagVerify: "tagVerify",
// 		requestJuiceTime: "requestJuiceTime",
// 	}

// 	constructor (id, msgData, msgMeta) {
// 		super (id);
// 		this.addHandler(this.codes.onPreRoll, this.onPreRollHandler.bind(this));
// 		this.addHandler(this.codes.giveJuice, this.onGiveJuice.bind(this));
// 		this.addHandler(this.codes.tagVerify, this.onTagVerify.bind(this));
// 		this.addHandler(this.codes.requestJuiceTime, this.onJuiceTimeRequest.bind(this));
// 	}

// 	static async onPreRollHandler(dataObj, metaData) {
// 		const user = game.users.find(user => user.id == metaData.senderId);
// 		if (game.user.isGM) {
// 			// const verify = await CityDialogs.tagVerify(dataObj);
// 			const verify = {amount : 1}; //test code
// 			return await this.send(this.codes.tagVerify, verify);
// 		} else {
// 			console.log("Trying to get help hurt");
// 			// const juice = await CityDialogs.getHelpHurt(dataObj);
// 			const juice = {amount : 1}; //test code
// 			return await this.send(this.codes.giveJuice, juice);
// 		}
// 	}

// }

