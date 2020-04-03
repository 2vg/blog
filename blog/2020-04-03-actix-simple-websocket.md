---
title: ActixでシンプルなWebSocket例を作ってみた
date: "2020-04-03T00:00:00.000Z"
description: "RustのActixで、シンプルなWebSocketを実装しました。いろんなクライアントにメッセージを送受信出来る機能に加え、なるべく最小限になるように実装してみました。"
slug: 2020/04/03/acitx-simple-webscoket
keywords: rust
tags:
  - rust
---

![logo-large.png](./images/logo-large.png)

> Actix - Rust's powerful actor system and most fun web framework
> [https://actix.rs](https://actix.rs/)

RustでWebSocketを扱いたい！となった時, `ws-rs` なりあると思うのですが,

RustでWebやるぞ～ってなったら, あれじゃないですか, Actixが結構いい感じみたいなのあるじゃないですか. (あるよね...？)

なのでActixとWebSocketをちょろっと触ってみようと思ったのですけど, これが思ってたよりも意外と難しかったので, 同じような人向けへのチュートリアル的な感じになれば嬉しいかな～, と思いますです.

というわけで, この記事ではRustのつよつよフレームワークであるActixを使用して, シンプルなWebSocket処理を実装したよ！っていう備忘録になっております.

コネクション貼って `hello` みたいなやつを送受信して終わり！ではなく, WebSocketといえばリアルタイムチャット！みたいなのがあると思うので,

接続している他のクライアントにもメッセージを送受信出来る機能に加え, それでいてなるべく最小限になるように実装してみました.

**筆者はRustぬーぶで, 記事を書くのも得意ではないので, ミスとかがあれば優しく指摘してください🙇‍♀️**

## 下準備

ディレクトリは `actix-example-websocket` とし, `cargo init` をして,  `Cargo.toml` を準備します.

今回はこんなかんじ↓

```toml
[package]
name = "actix-example-websocket"
version = "0.1.0"
authors = ["uru"]
edition = "2018"

[dependencies]
actix = "0.9.0"
actix-rt = "1.0.0"
actix-web = "2.0.0"
actix-web-actors = "2.0.0"
rand = "0.7.3"
```

もし `cargo-edit` を入れてるなら `cargo add actix actix-rt actix-web actix-web-actor rand`

で, 全部入ります. `cargo-edit` 優秀.

これで今回やることの依存関係は全部です. 早速実装してみましょう.

ActixのWebSocket実装では, メインのアクターサーバーとWebSocket用のアクターサーバーを作るようです. ([actix/example/websocket](https://github.com/actix/examples/tree/master/websocket)より)

こんなかんじ

```
Client <-> Main Actor Server <-> Ws Handle Actor
```

## WebSocketアクターサーバーの実装

先にWebSocket用のアクターサーバーを実装してみます.

こいつは `ws_actor.rs` とします. `lib.rs` で定義しておいてください

というのもメインでWebSocket用のアクター構造体を使用するので, 先に定義とか済ませておきたいのです！

まずは必要な構造体を作ります.

```rust
use actix::prelude::*;

use std::collections::HashMap;

pub struct WsActor {
    sessions: HashMap<u32, Recipient<Message>>,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct Message(pub String);

#[derive(Message)]
#[rtype(u32)]
pub struct Connect {
    pub addr: Recipient<Message>,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct Disconnect {
    pub id: u32,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct ClientMessage {
    pub id: u32,
    pub msg: String,
}
```

- `WsActor`: WebSocket用のアクターサーバーの構造体です.
- `Message`: メッセージ用の構造体
- `ClientMessage`: `Message` をハンドルするときに使用します.
- `Connect`: クライアントの接続をハンドルするときに使用します. 
- `Disconnect`: クライアントの切断をハンドルするときに使用します.

`#[derive(Message)]` は, なんか必要なやつっぽいです(たぶんメッセージのハンドルのために必要？), 調査不足 ;-;

`#[rtype(...)]` は, 処理を行った後にメインのサーバーに返すときの型を記述します.

メッセージをクライアントに返したりするのはWebSocketアクターサーバー本体がやるので, メインには返さず, ほとんどの場合 `()` になってます.

構造体を定義したので, `impl` で必要な実装を施します.

まずは `WsActor` 単体とアクタートレイトの実装からです.

```rust
impl WsActor {
    pub fn new() -> WsActor {
        WsActor {
            sessions: HashMap::new(),
        }
    }

    fn send_message(&self, message: &str) {
        for (_, addr) in &self.sessions {
            let _ = addr.do_send(Message(message.to_owned()));
        }
    }
}

impl Actor for WsActor {
    type Context = Context<Self>;
}
```

簡単ですね！ アクターの作成とメッセージを返信するときの関数だけです.

`Actor` トレイトを実装することで, `start` 関数等のアクターの動作に関する関数が使えるようになります！

後は残っているWebSocketハンドル用の実装をしちゃいます

```rust
impl Handler<Connect> for WsActor {
    type Result = u32;

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) -> Self::Result {
        let client_id = rand::random::<u32>();
        self.sessions.insert(client_id, msg.addr);
        self.send_message(&format!("{} connected!", client_id));
        client_id
    }
}

impl Handler<Disconnect> for WsActor {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) {
        let client_id = msg.id;
        self.send_message(&format!("{} disconnected...;-;", client_id));
        self.sessions.remove(&client_id);
    }
}

impl Handler<ClientMessage> for WsActor {
    type Result = ();

    fn handle(&mut self, msg: ClientMessage, _: &mut Context<Self>) {
        self.send_message(&msg.msg);
    }
}
```

これも分けて考えればぜんぜん難しくありません.

WebScoketアクターサーバーが処理後にメインアクターに返すデータの型の定義と,

クライアントの 接続/切断 時のハンドルと, メッセージをもらってから返すまでの処理を実装するだけです.

`Connected` ハンドルのみ `u32` を返すようになっていますが,

これはユニークなIDを生成し, それをメインアクターへ返すことで接続しているクライアントの識別をして管理するためです.

このユニークIDをメインアクターに返してあげないと, メインでは誰が誰だかわからなくなってしまいます.

ユニークIDは, クライアント接続時に `WsActor` の `session` フィールドのハッシュマップのキーとして使われ, そのキーに対するデータがクライアントの `Recipent` になっております.

この `Recipent` はクライアントへのメッセージの返信に必要です. 簡単に言うと宅配センターが荷物受付けた時にどこに送ったらいいの情報, みたいなやつ. 住所みたいなもん.

`Disconnected` で, クライアントが切断したらセッション管理用のハッシュマップからユニークIDを削除しています.

`ClientMessage` では, もらったメッセージをそのまま全てのクライアントに横流ししてるだけです.

WebSocketアクターサーバーの実装はこれだけです！意外と簡単～

## メインサーバーの実装

WebSocket用のアクターサーバーの実装ができたので, メインのアクターサーバーを実装しましょう.

WebSocketアクターサーバーを実装したときと同じ用に, 構造体等を先に書いちゃいます

```rust
use actix::prelude::*;
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_web_actors::ws;
use std::time::{Duration, Instant};
use actix_example_websocket::ws_actor::WsActor;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

struct WsSession {
    id: u32,
    hb: Instant,
    addr: Addr<WsActor>,
}
```

`HEARTBEAT_INTERVAL` は接続したクライアントの死活監視の間隔を,

`CLIENT_TIMEOUT` はこの秒数以上応答がなかったら切断したとみなすあれです. ハートビート時に使います.

次に実装です.

まずハートビートの実装をします.

ハートビートはクライアントの接続/切断を一定時間ごとに確認するためのものです.

```rust
impl WsSession {
    fn hb(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            if Instant::now().duration_since(act.hb) > CLIENT_TIMEOUT {
                println!("Websocket Client heartbeat failed, disconnecting!");
                act.addr
                    .do_send(actix_example_websocket::ws_actor::Disconnect { id: act.id });
                ctx.stop();
                return;
            }
            ctx.ping(b"");
        });
    }
}
```

WebSocketのコンテキスト構造体に実装されている `run_interval` をコールし, `CLIENT_TIMEOUT` 以上に応答がなかった場合の切断処理を定義しています.

必ず `ping` のコールを忘れないようにしましょう.

`ping` がクライアントの死活監視に使われます.

次に, `WsSession` に `Actor` トレイトを実装します.

```rust
impl Actor for WsSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);

        let addr = ctx.address();
        self.addr
            .send(actix_example_websocket::ws_actor::Connect {
                addr: addr.recipient(),
            })
            .into_actor(self)
            .then(|res, act, ctx| {
                match res {
                    Ok(res) => act.id = res,
                    _ => ctx.stop(),
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    fn stopping(&mut self, _: &mut Self::Context) -> Running {
        self.addr
            .do_send(actix_example_websocket::ws_actor::Disconnect { id: self.id });
        Running::Stop
    }
}
```

WebSocketアクターサーバーの時と違い,  `started` と `stopping` を実装しました.

それぞれクライアントの接続/切断の処理で必要です.

クライアントに対して, 接続時に `started` 処理の `Ok(res) => act.id = res` でユニークIDを付与しています.

`res` がWebSocketアクターサーバーから返されるユニークIDですね～

`stopping` ではWebSocketアクターサーバーにクライアントが切断したよ～と, そのクライアントのユニークIDと共に通知します.

ここまで来たらあとはクライアントからの要求を処理するハンドラー用の実装をしてほぼ完成です.

```rust
impl Handler<actix_example_websocket::ws_actor::Message> for WsSession {
    type Result = ();

    fn handle(&mut self, msg: actix_example_websocket::ws_actor::Message, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        let msg = match msg {
            Err(_) => {
                ctx.stop();
                return;
            }
            Ok(msg) => msg,
        };

        match msg {
            ws::Message::Ping(msg) => {
                self.hb = Instant::now();
                ctx.pong(&msg);
            }
            ws::Message::Pong(_) => {
                self.hb = Instant::now();
            }
            ws::Message::Text(text) => {
                let m = text.trim();

                self.addr
                    .do_send(actix_example_websocket::ws_actor::ClientMessage {
                        id: self.id,
                        msg: m.to_string(),
                    })
            }
            ws::Message::Binary(_) => println!("Unexpected binary"),
            ws::Message::Close(_) => {
                ctx.stop();
            }
            ws::Message::Continuation(_) => {
                ctx.stop();
            }
            ws::Message::Nop => (),
        }
    }
}
```

`impl Handler<actix_example_websocket::ws_actor::Message> for WsSession` について,

調査不足によりどういう使われ方なのかよくわかっていませぬ...;-;

`StreamHandler` で, クライアントとの送受信においてどのようなデータをどう処理するかを実装しています.

例えばそれがハートビート確認だったら `Ping` と `Pong` に処理が行ったり,

`Text` であれば受信したメッセージをWebSocketアクターサーバーにそのクライアントのIDと共に渡しています.

最後に, ルーティングとサーバーを開始するコードを書いて完成です！

```rust
pub async fn ws_route(
    req: HttpRequest,
    stream: web::Payload,
    srv: web::Data<Addr<WsActor>>,
) -> Result<HttpResponse, Error> {
    ws::start(
        WsSession {
            id: 0,
            hb: Instant::now(),
            addr: srv.get_ref().clone(),
        },
        &req,
        stream,
    )
}

#[actix_rt::main]
async fn main() -> std::io::Result<()> {
    let ws_server = WsActor::new().start();
    HttpServer::new(move || {
        App::new()
            .data(ws_server.clone())
            .service(web::resource("/ws/").to(ws_route))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
```

WebSocket用のルーティングでは,

WebSocket用のセッション構造体を作ってクライアントとのストリームと共にWebSocketセッションを開始する処理を書きました.

`main` 関数では, 

`#[actix_rt::main]` を前につけてこれが `main` であることをactixに伝え,

`WsActor::new().start()` で先にWebSocketアクターサーバーを開始し,そのアクターサーバーを

メインのアクターサーバーの `Data` へ共有します.

この `Data`, つまりWebSocketアクターサーバーは `WsSession.addr` に格納され,

`メイン <-> WebSocketアクター` という感じで相互通信するために使われていますね.

これだけでメッセージを横流しするWebSocketアプリの完成です！

フロントエンドで `<local_address(localhostとか)>:8080/ws/` にWebSocketコネクションを貼るようにすれば, 

メッセージを送ったらそれが自分と他の接続しているクライアント全てに送信されます.

## まとめ/感想

Actixは他のフレームワークと違って少し記述が多くなるな～って感じです.

ただ, 分けて考えるとすごくわかりやすいな～と感じますし, 意外と綺麗に書けるかな, と思いました.

触ってる感じだと他の言語のフルスタックなフレームワークっぽい気もします,

が, そこまで必要な物が揃ってるというわけでもなさそう. (例えばセッション周りとか, 前調べた時結構がばいセキュリティみたいな感じだった気がします.)

全体的にはすごく完成されてるようなフレームワークかな, と思うので, このまま開発が進んで,RustでWeb？Actix！くらいになっていくのかな～

Actixの今後が楽しみですネ！
