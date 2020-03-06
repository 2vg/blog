---
templateKey: blog-post
id: README
title: Rustで超シンプルなゲームサーバーを実装してみる-1
slug: /2020/03/06/README
date: 2020-03-05T00:00:00.000Z
description: "Rustでシンプルなゲームサーバーを作ってみる①"
tags:
  - gatsby
---

# Rustで超シンプルなゲームサーバーを実装してみる-1

最近ずっとRustにハマっていて、さらなる学びの為に何か無いかな～と探していたところ、こんな記事を見つけました

> [Game Server in 150 lines of Rust](https://medium.com/p/ce1782199907)

Rustでシンプルなゲームサーバーを150行で実装した、らしいです。

とっても楽しそうなので、僕もやってみることにしました。

さっきの記事ではTokioのランタイム、Future、websocketクレートを利用し、データ保存にHashMapを使用して実装したようです。

僕は新しい物好きなので、モダンなクレートを使って挑戦してみようと思いました。

とりあえずサーバー側はActix、データ保存にSledという感じでやってみようと思います。

適当に`cargo init`をし、必要なクレートをぶち込みます。

```toml
[package]
name = "gameserver-sandbox-rs"
version = "0.1.0"
authors = ["2vg"]
edition = "2018"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[dependencies]
anyhow = "*"
sled = "0.31.0"
rand = "0.7.3"
byteorder = "1.3.4"
actix = "0.9.0"
actix-web = "2.0.0"
actix-web-actors = "2.0.0"
actix-rt = "1.0.0"
serde = "1.0.104"
serde_json = "1.0.48"
```

`Cargo.toml`はこんな感じになりました。

`anyhow`は最近人気のエラークレートで、いい感じにエラーを包んでくれるらしいです。

今回はガチのゲームサーバーを作るわけではないですが、適当に握りつぶすのもあれなので、適当にやってもエラーをラップしてくれるこいつを入れておきます

`sled`はRustで開発されてる次世代？の組み込みDBです。

SQLiteのインメモリーでもよかったのですが、新しいもの好きとしてこっちを採用しました。

`rand`はユニークなIDを作るときに使います。

`byteorder`は`Sled`でデータをやり取りするときに必要なので突っ込んでます。

`actix`系は説明いらないですね、非同期サーバーとしてめちゃくちゃパフォーマンスが出るあれです。

`serde`系も説明いらないですよね、適当に`json`でやり取りする予定なので突っ込んでます。

必要なクレートが揃ったところで、実装していきましょう。

今回実装するにあたって、DDDアーキテクチャを開発に取り入れます。

Rust + DDDなものって全然見つからなかったのですが、こちらのWebアプリケーションは完成度が高そうなので、こちらを参考にしつつって感じです。

> [colinbankier/realworld-tide](https://github.com/colinbankier/realworld-tide)

DDDって言っても色々あると思いますが、このリポジトリでは`ヘキサゴナルアーキテクチャ`を使っているそうです。

では僕も同じような構成で行きましょう。

最終的な構造はこんな感じになる予定です。

```
│  .gitignore
│  Cargo.lock
│  Cargo.toml
│  README.md
│
└─src
    │  lib.rs
    │  main.rs
    │
    ├─app
    │      game_server_actor.rs
    │      mod.rs
    │      server.rs
    │      ws_handler.rs
    │
    ├─data
    │  │  mod.rs
    │  │  repositories.rs
    │  │
    │  ├─models
    │  │      entities.rs
    │  │      mod.rs
    │  │
    │  └─queries
    │          entities.rs
    │          mod.rs
    │
    └─domain
        │  mod.rs
        │  repositories.rs
        │
        └─models
                entities.rs
                mod.rs
```

~~Windowsのtreeコマンド醜い~~

まずドメインモデルから。

```Rust:entities.rs
#[derive(Clone, Debug)]
pub struct Entity {
    pub id: u32,
    pub pos: (i32, i32)
}

impl Entity {
    pub fn new_with_empty() -> Entity {
        Entity{ id: rand::random::<u32>(), pos: (0, 0) }
    }

    pub fn new(id: u32, pos: (i32, i32)) -> Entity {
        Entity{ id: id, pos: pos }
    }
}
```

ものすごくシンプルな`Entity`構造体です。

クライアントはユニークIDを元に自分と他人を見分け、`pos`からポジションを取得して描画する、それだけをやる前提とします。

この`id`は後々出てくるwebsocketのセッションのユニークIDとしても使うことにします。

ドメインモデルを定義したら、ドメインとアプリケーションを繋ぐアダプターである`Repository`を作ります。

といっても今回採用したアーキテクチャではインターフェースのみを定義するだけでいいので、トレイトを定義します。

```Rust:repositores.rs
use anyhow::Result;
use crate::domain::models::entities::*;

pub trait Repository {
    fn create_entity(&self, entity: Entity) -> Result<Entity>;
    fn select_entity(&self, id: u32) -> Result<Entity>;
    fn update_entity(&self, entity: Entity) -> Result<Entity>;
    fn delete_entity(&self, id: u32) -> Result<()>;
}
```

ドメインの`Repository`では定義だけで、実際の中身の実装は`data`に属する`Repository`で行います。

次に流れでデータモデルを作ります。

```Rust:entities.rs
#[derive(Clone, Debug)]
pub struct Entity {
    pub id: u32,
    pub pos: (i32, i32)

pub struct NewEntity {
    pub id: u32,
    pub pos: (i32, i32)
}

pub struct UpdateEntity {
    pub id: u32,
    pub pos: (i32, i32)
}
```

`Entity`自体はドメインモデルにあるやつと一緒ですが、`NewEntity`と`UpdateEntity`を新しく定義しました。

とはいっても中身は全く一緒なわけですけど

でも、こうしておくことで例えばデータ保存先をMySQLにしたい！って後でなってしまったときに`diesel`を組み合わせることが可能になります。

`diesel`では`insert`や`update`などのクエリを使うときにそれぞれの構造体に`derive`をつけないといけない仕様だったはずなので、`derive`つけてデータリポジトリの実装をMySQL向けにするだけでよくなるのです。

他にもありますけど、まぁこれだけでもDDDすごいな～って感じです(はなほじ)

流れでデータリポジトリを実装したいところですが、先にクエリを発行してくれる部分を書いちゃいます。

```Rust:entities.rs
use anyhow::*;

use crate::data::models::entities::*;
use crate::data::repositories::Repository;

use std::io::Cursor;
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};

pub fn insert(repo: &Repository, entity: NewEntity) -> Result<Entity> {
    let mut id = vec![];
    id.write_u32::<LittleEndian>(entity.id)?;
    let mut position = vec![];
    position.write_i32::<LittleEndian>(entity.pos.0)?;
    position.write_i32::<LittleEndian>(entity.pos.1)?;

    repo.conn().insert(id, position)?;

    Ok(Entity { id: entity.id, pos: entity.pos })
}

pub fn select_one(repo: &Repository, id: u32) -> Result<Entity> {
    let mut b_id = vec![];
    b_id.write_u32::<LittleEndian>(id)?;

    if let Some(result) = repo.conn().get(b_id)? {
        let mut position = Cursor::new(result);
        let pos_x = position.read_i32::<LittleEndian>()?;
        let pos_y = position.read_i32::<LittleEndian>()?;
        Ok(Entity { id: id, pos: (pos_x, pos_y) })
    }
    else {
        Err(anyhow!("entity not found."))
    }
}

pub fn update(repo: &Repository, entity: UpdateEntity) -> Result<Entity> {
    let mut id = vec![];
    id.write_u32::<LittleEndian>(entity.id)?;
    let mut position = vec![];
    position.write_i32::<LittleEndian>(entity.pos.0)?;
    position.write_i32::<LittleEndian>(entity.pos.1)?;

    repo.conn().insert(id, position)?;

    Ok(Entity { id: entity.id, pos: entity.pos })
}

pub fn delete(repo: &Repository, id: u32) -> Result<()> {
    let mut b_id = vec![];
    b_id.write_u32::<LittleEndian>(id)?;

    repo.conn().remove(b_id)?;

    Ok(())
}
```

まず見たらわかるんですけど、`insert`と`update`は使ってる`Entity`構造体の種類を除いて一緒です。

なぜ分けたかというと、`update`には後々トランザクショナルな処理を挟むかもしれない、という理由だけです。

`Sled`にそれっぽい関数があったので、これを使う機会が来たら分けておいてよかったね、になると思います。(拡張する気はないので来ないと思うけど、分けちゃったのでめんどくなった)

ちょっとめんどいな～って思うのはやっぱり`id`をいちいち`Vec<u8>`に変換しないといけないところですね。

`Sled`は`<Vec<u8>, Vec<u8>>`でデータを扱うので、何もかもバイナリにしないといけません。

クエリはとりあえずこれでいいので、データリポジトリを実装しちゃいます。

```Rust:repositories.rs
use anyhow::Result;
use sled::Config;

use crate::data;
use crate::domain;
use crate::data::queries;

#[derive(Clone, Debug)]
pub struct Repository {
    connection: sled::Db
}

impl Repository {
    pub fn new() -> Result<Repository> {
        let config = Config::new().temporary(true);
        Ok(Repository { connection: config.open()? })
    }

    pub fn conn(&self) -> &sled::Db {
        &self.connection
    }
}

impl domain::repositories::Repository for Repository {
    fn create_entity(&self, entity: domain::models::entities::Entity) -> Result<domain::models::entities::Entity> {
        use data::models::entities::NewEntity;

        let entity = NewEntity{ id: entity.id, pos: entity.pos };
        let result = queries::entities::insert(&self, entity)?;

        Ok(domain::models::entities::Entity { id: result.id, pos: result.pos })
    }

    fn select_entity(&self, id: u32) -> Result<domain::models::entities::Entity> {
        let result = queries::entities::select_one(&self, id)?;

        Ok(domain::models::entities::Entity { id: result.id, pos: result.pos })
    }

    fn update_entity(&self, entity: domain::models::entities::Entity) -> Result<domain::models::entities::Entity> {
        use data::models::entities::UpdateEntity;

        let entity = UpdateEntity{ id: entity.id, pos: entity.pos };
        let result = queries::entities::update(&self, entity)?;

        Ok(domain::models::entities::Entity { id: result.id, pos: result.pos })
    }

    fn delete_entity(&self, id: u32) -> Result<()> {
        Ok(queries::entities::delete(&self, id)?)
    }
}
```

ちょっと長い気もしますが、難しい内容ではないです。

ドメインリポジトリのインターフェースに合わせて引数の`Entity`やら`id`をさっきのクエリ実装に投げているだけです。

リポジトリを作るときに`Result`で包んだのは気分です。

データ保存先が`MySQL`とかだったら接続できませんでした、的なエラー処理を挟めるかもしれない、くらいで包みました。

`Sled`も一応データ保存をファイルに書き出すことはできるのですが、そもそも今回テンポラリなデータ保存になってるのでサーバーを落とした瞬間にデータが吹き飛びます。

接続できる/できないはもはや関係ないわけです。

できなかったらメモリが256MBとかのカツカツな環境で`Sled`のテンポラリDB作ろうとしてメモリ足りなくてエラー出た、みたいな感じですかね。

さて、ドメインとデータの層が実装できたと思うので、実際のアプリケーションを書きます...

と思ったのですが、コードが長めになると思うので、ここで区切りをつけて次の記事でちょろちょろ説明しながら書こうと思います。

今回はここまで！
