---
title: RustでProcessHollowingを実装してみる
date: "2021-03-16T09:24:00.000Z"
description: ""
slug: 2021/03/16/process-hollowing-on-rust
keywords: rust
tags:
  - rust
---

RustでProcess Hollowingをやってみました。

Process Hollowingって何？ -> [Process Injection: Process Hollowing, Sub-technique T1055.012 - Enterprise | MITRE ATT&CK®](https://attack.mitre.org/techniques/T1055/012/)

> Adversaries may inject malicious code into suspended and hollowed processes in order to evade process-based defenses. Process hollowing is a method of executing arbitrary code in the address space of a separate live process.

> Process hollowing is commonly performed by creating a process in a suspended state then unmapping/hollowing its memory, which can then be replaced with malicious code. A victim process can be created with native Windows API calls such as CreateProcess, which includes a flag to suspend the processes primary thread. At this point the process can be unmapped using APIs calls such as ZwUnmapViewOfSection or NtUnmapViewOfSection before being written to, realigned to the injected code, and resumed via VirtualAllocEx, WriteProcessMemory, SetThreadContext, then ResumeThread respectively.[\[1\]](https://www.autosectools.com/process-hollowing.pdf)[\[2\]](https://www.endgame.com/blog/technical-blog/ten-process-injection-techniques-technical-survey-common-and-trending-process)

> This is very similar to Thread Local Storage but creates a new process rather than targeting an existing process. This behavior will likely not result in elevated privileges since the injected process was spawned from (and thus inherits the security context) of the injecting process. However, execution via process hollowing may also evade detection from security products since the execution is masked under a legitimate process.

英語の羅列、読めないね...

日本語ではプロセス空洞化とか言ったりします。

これは、あるプロセスを中断状態で作成し、内部のイメージメモリのマッピングを解除して別のイメージメモリをマッピングすることによって行われます。

これにより、メモ帳を起動したけど中身は電卓、みたいなことが実現できます。

具体的な処理フローとしては、

- 1: `CreateProcess`を`CREATE_SUSPENDED`フラグ付きでコール
- 2: `NtUnmapViewOfSection`をコールして、イメージのマッピングを解除
- 3: `VirtualAllocEx`をコールして、ターゲットプロセス内に別の注入する実行イメージのためのメモリを確保
- 4: ベースアドレスを変更し、注入する実行イメージを確保したメモリにコピーして、メモリ再配置を適用する
- 5: スレッドのコンテキストを取得し、エントリポイントをセットし直してから編集したコンテキストをセットする
- 6: 中断状態で作成されたプロセスのメインスレッドをResume
- 7: Yay

自作のPE操作ツールを組み込んで実装してしまったので、コード全部貼ると長い。。。のでリポジトリのURL -> [2vg/blackcat-rs/process-hollow](https://github.com/2vg/blackcat-rs/tree/master/crate/process-hollow)

TODO: 時間が出来たらもっと詳しくかく
