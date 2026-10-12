/* Direct messages. A list of conversations; tapping one opens the thread with a
	box to reply. Served by the chat service via the proxy header in BS.Api. */
enyo.kind({
	name: "BS.Chat",
	kind: enyo.VFlexBox,
	className: "bs-feed",
	events: {
		onPick: ""
	},
	components: [
		{name: "inner", kind: "Pane", flex: 1, components: [
			{name: "listView", kind: "VFlexBox", components: [
				{name: "listNote", className: "bs-feed-note", showing: false},
				{name: "listScroller", kind: "Scroller", flex: 1, accelerated: false, components: [
					{name: "convoList"}
				]}
			]},
			{name: "msgView", kind: "VFlexBox", components: [
				{kind: "HFlexBox", align: "center", className: "bs-subbar", components: [
					{kind: "Button", caption: "‹ Chats", className: "enyo-button-dark", onclick: "backToList"},
					{name: "title", className: "bs-subbar-title", flex: 1}
				]},
				{name: "msgNote", className: "bs-feed-note", showing: false},
				{name: "msgScroller", kind: "Scroller", flex: 1, accelerated: false, components: [
					{name: "msgList"}
				]},
				{kind: "HFlexBox", align: "center", className: "bs-chat-compose", components: [
					{name: "input", kind: "Input", flex: 1, hint: "Message", onkeydown: "inputKey",
						autoCapitalize: "sentences"},
					{name: "send", kind: "Button", caption: "Send", className: "enyo-button-blue", onclick: "sendClick"}
				]}
			]}
		]}
	],

	create: function() {
		this.inherited(arguments);
		this.loaded = false;
		this.turn = 0;
		this.convoId = "";
	},

	open: function() {
		this.$.inner.selectViewByName("listView");
		if (!this.loaded) { this.loadConvos(); }
	},

	atMsg: function() {
		return this.$.inner.getViewName() === "msgView";
	},

	backToList: function() {
		this.turn++;
		this.$.inner.selectViewByName("listView");
	},

	// ---- conversations ----

	loadConvos: function() {
		var self = this;
		this.loaded = true;
		this.$.listNote.setContent("Loading…");
		this.$.listNote.setShowing(true);
		BS.Api.convos("", function(error, data) {
			if (error) {
				self.$.listNote.setContent(error === "signin" ? "Please sign in again." :
					"Chat could not be loaded. " + error);
				return;
			}
			self.buildConvos(data.convos || []);
		});
	},

	buildConvos: function(convos) {
		this.$.convoList.destroyControls();
		var me = (BS.session() || {}).did;
		var pending = [];
		for (var i = 0; i < convos.length; i++) {
			this.addConvoRow(convos[i], me, pending);
		}
		if (this.$.convoList.hasNode()) { this.$.convoList.render(); }
		BS.fillEmoji(pending);
		var empty = !this.$.convoList.getControls().length;
		this.$.listNote.setContent(empty ? "No conversations yet." : "");
		this.$.listNote.setShowing(empty);
	},

	// The person who is not me.
	other: function(convo, me) {
		var members = convo.members || [];
		for (var i = 0; i < members.length; i++) {
			if (members[i].did !== me) { return members[i]; }
		}
		return members[0] || {};
	},

	addConvoRow: function(convo, me, pending) {
		var who = this.other(convo, me);
		var name = BS.emojiHtml(who.displayName || who.handle || "");
		pending.push.apply(pending, name.list);
		var last = convo.lastMessage && convo.lastMessage.text ? convo.lastMessage.text : "";
		var lastHtml = "";
		if (last) {
			var l = BS.emojiHtml(last.replace(/\n+/g, " "));
			pending.push.apply(pending, l.list);
			lastHtml = "<div class='bs-actor-bio" + (convo.unreadCount ? " bs-unread" : "") + "'>" + l.html + "</div>";
		}
		var row = this.$.convoList.createComponent({
			kind: "HFlexBox", className: "bs-notif", convoId: convo.id, who: who.displayName || who.handle || "",
			onclick: "convoTap", owner: this,
			components: [
				{className: "bs-notif-avatar"},
				{flex: 1, allowHtml: true, content: "<span class='bs-name'>" + name.html + "</span>" + lastHtml}
			]
		});
		BS.bg(row.getControls()[0], BS.avatarThumb(who.avatar));
	},

	convoTap: function(inSender) {
		this.openConvo(inSender.convoId, inSender.who);
	},

	// ---- one conversation ----

	openConvo: function(id, who) {
		this.convoId = id;
		this.$.title.setContent(BS.escape(who));
		this.$.input.setValue("");
		this.$.inner.selectViewByName("msgView");
		this.loadMessages();
	},

	loadMessages: function() {
		var self = this;
		var turn = ++this.turn;
		this.$.msgList.destroyControls();
		if (this.$.msgList.hasNode()) { this.$.msgList.render(); }
		this.$.msgNote.setContent("Loading…");
		this.$.msgNote.setShowing(true);
		BS.Api.messages(this.convoId, "", function(error, data) {
			if (turn !== self.turn) { return; }
			if (error) {
				self.$.msgNote.setContent(error === "signin" ? "Please sign in again." : error);
				return;
			}
			// Newest first from the API; show oldest at the top.
			var msgs = (data.messages || []).slice(0).reverse();
			self.showMessages(msgs);
		});
	},

	showMessages: function(msgs) {
		this.$.msgList.destroyControls();
		var me = (BS.session() || {}).did;
		var pending = [];
		for (var i = 0; i < msgs.length; i++) {
			this.addMsg(msgs[i], me, pending);
		}
		if (this.$.msgList.hasNode()) { this.$.msgList.render(); }
		BS.fillEmoji(pending);
		this.$.msgNote.setShowing(!this.$.msgList.getControls().length);
		this.$.msgNote.setContent(this.$.msgList.getControls().length ? "" : "No messages yet. Say hello.");
		this.toBottom();
	},

	addMsg: function(msg, me, pending) {
		if (!msg || msg.text === undefined) { return; }
		var mine = msg.sender && msg.sender.did === me;
		var t = BS.emojiHtml(msg.text);
		pending.push.apply(pending, t.list);
		this.$.msgList.createComponent({
			className: "bs-msgrow " + (mine ? "bs-msg-mine" : "bs-msg-them"),
			components: [{allowHtml: true, className: "bs-bubble " + (mine ? "bs-bubble-mine" : "bs-bubble-them"),
				content: t.html}]
		});
	},

	toBottom: function() {
		var self = this;
		enyo.asyncMethod(this, function() { self.$.msgScroller.scrollTo(999999, 0); });
	},

	// ---- sending ----

	inputKey: function(inSender, inEvent) {
		if (inEvent.keyCode === 13) { this.sendClick(); }
	},

	sendClick: function() {
		var self = this;
		var text = String(this.$.input.getValue() || "").replace(/^\s+|\s+$/g, "");
		if (!text || this.sending || !this.convoId) { return; }
		this.sending = true;
		this.$.send.setDisabled(true);
		BS.Api.sendMessage(this.convoId, text, function(error, msg) {
			self.sending = false;
			self.$.send.setDisabled(false);
			if (error) { BS.banner(error); return; }
			self.$.input.setValue("");
			var pending = [];
			self.addMsg(msg && msg.text !== undefined ? msg :
				{text: text, sender: {did: (BS.session() || {}).did}}, (BS.session() || {}).did, pending);
			if (self.$.msgList.hasNode()) { self.$.msgList.render(); }
			BS.fillEmoji(pending);
			self.$.msgNote.setShowing(false);
			self.toBottom();
		});
	}
});
