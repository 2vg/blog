---
title: Rustでshellcode RDI(x64)の実装
date: "2021-04-19T17:52:00.000Z"
description: "Rustでshellcodeですってぇ～！？"
slug: 2021/04/19/shellcode-rdi-on-rust
keywords: rust
tags:
  - rust
---

[Reflective DLL Injection](https://www.ired.team/offensive-security/code-injection-process-injection/reflective-dll-injection)という、DLLをリモートプロセスにインジェクトする手法があります。(以下RDIと呼びます)

DLLインジェクションには様々なテクニックがありますが、この手法の特徴として、攻撃者は<u>**メモリ**</u>からDLLをインジェクトすることが可能です。

これにより、例えばネットワークからバイナリをストリーミングしてからターゲットプロセスでDLLをロードしたりすることが可能となっているので汎用性が高いように見えますが、PoCが出てから時間が経っているので、たぶん最近のAVやEDRでは簡単に検出可能だと思います、たぶん

PoCリポジトリはこちら: [stephenfewer/ReflectiveDLLInjection](https://github.com/stephenfewer/ReflectiveDLLInjection)

これを見よう見まねでRustで実装しようとしましたが、残念ながらRDIのDLLをうまく作成することが出来ませんでした。

そのため、RustでRDIは不可能なのか...と諦めかけていたところ、こんなものを発見しました: [monoxgas/sRDI](https://github.com/monoxgas/sRDI)

> sRDI - Shellcode Reflective DLL Injection</br>
> sRDI allows for the conversion of DLL files to position independent shellcode. It attempts to be a fully functional PE loader supporting proper section permissions, TLS callbacks, and sanity checks. It can be thought of as a shellcode PE loader strapped to a packed DLL.

ほう...shellcodeとしてRDIをビルドすることで位置に依存しないと、素晴らしい！

というわけで、これならRustでも出来るんじゃないかな？と思ったので、挑戦してみました。

## Rustをshellcodeに出来るの？

そもそも論、Rustをshellcodeに出来るのか？という所からスタートします。

てかshellcodeって何？

`google: shellcode [search]`

> シェルコード（英: Shellcode）とは、コンピュータセキュリティにおいて、ソフトウェアのセキュリティホールを利用するペイロードとして使われるコード断片である。 侵入したマシンを攻撃者が制御できるようにするため、シェルを起動することが多いことから「シェルコード」と呼ぶ。

元々は、シェルを起動するためのペイロードコード断片のようなものの事を指していたようです。

しかし、近年ではシェルを起動するばかりではなく、他の処理もバイナリを手書きしたりして攻撃されるようになってきました。

これら全てをshellcodeとして含んでしまっていいようです。

。。。つまるところ、他の特別な処理なしに即時実行できるコード断片のことをshellcodeといいます。

**他の特別な処理なしに即時実行できる**、というのはどういうことでしょうか。

Windowsでは、実行可能ファイルを実行する時、ローダーの処理を挟みます。

プログラムはWindowsのAPIを使ったりするので、APIを使うために関数のアドレスをインポートしたり、実行するためのメモリを確保したりしなければなりません。

このロード処理は文書化されていませんが、たくさんのHackerによりある程度処理が判明しています。

このロード処理を手で書いて、それをshellcodeとすることで、今回の目的を達成できます。

とはいえ、まずRustのプログラムをshellcodeに出来ないと話にならないため、簡単なプログラムをshellcodeに出来るか挑戦します。

まず何から手をつけたらいいかな...と調査してたら既にやってる人がいました、しかも都合よくWindowsで。(はなほじ): [Write Windows Shellcode in Rust b1tg/rust-windows-shellcode](https://github.com/b1tg/rust-windows-shellcode)

...というわけで、shellcodeには出来るっぽいです、何もせず終わってしまった

## Rustをshellcodeにするためのもの

リポジトリのコードを見てみると、`!#[no_std]`を使用したり、`.cargo`内の`config`でリンカーオプションを設定しているようです。

特にリンカーオプションは重要そうですね。

```toml
[build]
target = "x86_64-pc-windows-msvc"
rustflags = [
    "-Z", "pre-link-arg=/NOLOGO",
    "-Z", "pre-link-arg=/NODEFAULTLIB",
    "-C", "link-arg=/ENTRY:main",
    "-C", "link-arg=/MERGE:.edata=.rdata",
    "-C", "link-arg=/MERGE:.rustc=.data",
    "-C", "link-arg=/MERGE:.rdata=.text",
    "-C", "link-arg=/MERGE:.pdata=.text",
    "-C", "link-arg=/DEBUG:NONE",
    "-C", "link-arg=/EMITPOGOPHASEINFO",
    "-C", "target-feature=-mmx,-sse,+soft-float",
    "--emit", "asm",
]
```

今回は64bitのみを想定しているので、`target = "x86_64-pc-windows-msvc"`はこのままでよさそうです。

`NODEFAULTLIB`で外部依存をなくしたり、`ENTRY`でエントリ関数を指定したり、`MERGE`でセクションをマージしたりしてるようです。

ちなみに、Rustでは`"--emit", "asm"`を指定することでビルド時に`asm`を吐いてくれます。

実際のコードを見てみます。

このリポジトリでは、実際のshellcodeプログラムは`shellcode/`に置かれているようなので、まずshellcodeのコードから覗いてみます。

`shellcode/src/binds.rs`ではWindowsのための構造体やら型が定義されていました。PEのやつとか。

`shellcode/src/utils.rs`では文字列操作のための便利関数が定義されていました。いくつか定義されていましたが、実際には`compare_raw_str`しか使ってなさそう。

`shellcode/src/main.rs`がshellcodeになる予定の本体ですね。ちょっと長いですが載せます。

```rust
#![allow(non_snake_case)]
#![allow(non_camel_case_types)]
#![allow(non_upper_case_globals)]
#![allow(overflowing_literals)]
#![no_std]
#![no_main]
#![feature(asm)]
#![feature(link_args)]
use core::ptr::null_mut;
mod binds;
mod utils;
use binds::*;
use utils::*;
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    loop {}
}
// const KERNEL32_DLL: &str = concat!("KERNEL32.DLL", "\0");
const USER32_DLL: &str = concat!("user32.dll", "\0");
const OutputDebugStringA_: &str = concat!("OutputDebugStringA", "\0");
const LoadLibraryA_: &str = concat!("LoadLibraryA", "\0");
const GetProcAddress_: &str = concat!("GetProcAddress", "\0");
const MessageBoxA_: &str = concat!("MessageBoxA", "\0");

pub type LoadLibraryAFn = extern "system" fn(lpFileName: LPCSTR) -> PVOID;
pub type GetProcAddressFn = extern "system" fn(hmodule: PVOID, name: LPCSTR) -> PVOID;
pub type MessageBoxAFn = extern "system" fn(h: PVOID, text: LPCSTR, cation: LPCSTR, t: u32) -> u32;
pub type OutputDebugStringAFn = extern "C" fn(*const i8);
pub type DbgPrintFn = extern "C" fn(Format: *const u8, ...) -> NTSTATUS;
#[no_mangle]
pub extern "C" fn main() -> ! {
    unsafe {
        // clean argc and argv
        asm!("mov rcx, 0", "mov rdx, 0",);
    }
    let KERNEL32_STR: [u16; 13] = [75, 69, 82, 78, 69, 76, 51, 50, 46, 68, 76, 76, 0];
    let kernel32_ptr = get_module_by_name(KERNEL32_STR.as_ptr());
    let dbg_addr = get_func_by_name(kernel32_ptr, OutputDebugStringA_.as_ptr());
    let load_library_ptr = get_func_by_name(kernel32_ptr, LoadLibraryA_.as_ptr());
    let get_proc = get_func_by_name(kernel32_ptr, GetProcAddress_.as_ptr());
    let LoadLibraryA: LoadLibraryAFn = unsafe { core::mem::transmute(load_library_ptr) };

    // make stack align
    unsafe { asm!("and rsp, ~0xf") };
    let u32_dll = LoadLibraryA(USER32_DLL.as_ptr() as *const i8);
    let GetProcAddress: GetProcAddressFn = unsafe { core::mem::transmute(get_proc) };
    let message_box_ptr = GetProcAddress(u32_dll, MessageBoxA_.as_ptr() as *const i8);
    let MessageBoxA: MessageBoxAFn = unsafe { core::mem::transmute(message_box_ptr) };

    let OutputDebugStringA: OutputDebugStringAFn = unsafe { core::mem::transmute(dbg_addr) };
    #[macro_export]
    macro_rules! debug_print {
        ($msg:expr) => {
            OutputDebugStringA(concat!($msg, "\n\0").as_ptr() as _)
        };
    }
    debug_print!("We made it! see me in DebugView or Debugger");
    debug_print!("Let's popup a messagebox");
    MessageBoxA(
        null_mut(),
        "Windows Shellcode with Rust!\0".as_ptr() as *const i8,
        "rocks\0".as_ptr() as _,
        0x30,
    );
    loop {}
}

fn get_module_by_name(module_name: *const u16) -> PVOID {
    let peb: *mut PEB;
    unsafe {
        asm!(
            "mov {}, gs:[0x60]",
            out(reg) peb,
        );
        let ldr = (*peb).Ldr;
        let list_entry = &((*ldr).InLoadOrderModuleList);
        let mut cur_module: *const LDR_DATA_TABLE_ENTRY = &list_entry as *const _ as *const _;
        loop {
            if cur_module.is_null() || (*cur_module).BaseAddress.is_null() {
                // TODO: when to break
            }
            let cur_name = (*cur_module).BaseDllName.Buffer;
            if !cur_name.is_null() {
                if compare_raw_str(module_name, cur_name) {
                    return (*cur_module).BaseAddress;
                }
            }
            let flink = (*cur_module).InLoadOrderModuleList.Flink;
            cur_module = flink as *const LDR_DATA_TABLE_ENTRY;
        }
    }
}

fn get_func_by_name(module: PVOID, func_name: *const u8) -> PVOID {
    let idh: *const IMAGE_DOS_HEADER = module as *const _;
    unsafe {
        if (*idh).e_magic != IMAGE_DOS_SIGNATURE {
            return null_mut();
        }
        let e_lfanew = (*idh).e_lfanew;
        let nt_headers: *const IMAGE_NT_HEADERS =
            (module as *const u8).offset(e_lfanew as isize) as *const _;
        let op_header = &(*nt_headers).OptionalHeader;
        let virtual_addr = (&op_header.DataDirectory[0]).VirtualAddress;
        let export_dir: *const IMAGE_EXPORT_DIRECTORY =
            (module as *const u8).offset(virtual_addr as _) as _;
        let number_of_names = (*export_dir).NumberOfNames;
        let addr_of_funcs = (*export_dir).AddressOfFunctions;
        let addr_of_names = (*export_dir).AddressOfNames;
        let addr_of_ords = (*export_dir).AddressOfNameOrdinals;
        for i in 0..number_of_names {
            let name_rva_p: *const DWORD =
                (module as *const u8).offset((addr_of_names + i * 4) as isize) as *const _;
            let name_index_p: *const WORD =
                (module as *const u8).offset((addr_of_ords + i * 2) as isize) as *const _;
            let name_index = name_index_p.as_ref().unwrap();
            let mut off: u32 = (4 * name_index) as u32;
            off = off + addr_of_funcs;
            let func_rva: *const DWORD = (module as *const u8).offset(off as _) as *const _;

            let name_rva = name_rva_p.as_ref().unwrap();
            let curr_name = (module as *const u8).offset(*name_rva as isize);

            if *curr_name == 0 {
                continue;
            }
            if compare_raw_str(func_name, curr_name) {
                let res = (module as *const u8).offset(*func_rva as isize);
                return res as _;
            }
        }
    }
    return null_mut();
}
// #[allow(unused_attributes)]
// #[cfg(target_env = "msvc")]
// #[link_args = "/GS- /MERGE:.rdata=.text /MERGE:.pdata=.text /NODEFAULTLIB /EMITPOGOPHASEINFO /DEBUG:NONE"]
// extern "C" {}
```

長い！！ので、フローにして整理してみます。

### shellcodeフロー

- 1: `asm!`マクロを使って、引数が格納されているレジスタをクリーンアップ
- 2: `get_module_by_name`を使用して、`KERNEL32.DLL`をロード、`get_func_by_name`を使用して使う関数のアドレスを取得
- 3: `asm!`マクロを使って、スタックを16バイト前にアラインメント
- 4: 2で取得した関数を使用して、`user32.dll`をロード、 同じく必要な関数のアドレスを取得
- 5: 4で取得した`OutputDebugStringA`や`MessageBoxA`を実際に呼び出す
- 6: `loop {}` <- ???


#### `asm!`マクロを使って、引数が格納されているレジスタをクリーンアップ

Windows x64では、関数を呼び出した時に引数がレジスタに格納されますが、格納の仕方が決まっています。詳細はこちら: [x64 での呼び出し規則](https://docs.microsoft.com/ja-jp/cpp/build/x64-calling-convention?view=msvc-160)

基本的には4つの引数までは`rcx`、`rdx`、`r8`、`r9`の順に格納され、5つ目以降の引数はスタックに配置されます。

`float`が入ってきたりするときはまたあれなんですが、今回はそれについての説明は省きます。

ともかく、`main`関数では引数を使用しないので、クリーンアップしたいということですね。

普通のプログラムならそんなこと気にしなくていいと思うんですけど、おそらく後でshellcodeにするので、なんかこうレジスタをリセットしておくといいのかもしれない。しらんけど。

#### `get_module_by_name`を使用して、`KERNEL32.DLL`をロード、`get_func_by_name`を使用して使う関数のアドレスを取得

ここで`get_module_by_name`と`get_func_by_name`という二つの関数が登場します。

この二つの関数の処理は、インジェクションでよく使われる処理を行います。

具体的には、`get_module_by_name`で自分自身のPEBを参照し、ロードされているDLLのリストから目的のDLLを見つけて、`get_func_by_name`でそのDLLから使いたい関数のアドレスを取得する、といった感じです。

`LoadLibraryA`とか、`GetProcAddress`を探してるみたいです。

ちなみに、`get_module_by_name`の最初の`asm!`マクロでこんなコードがあるのですが、

```rust
let peb: *mut PEB;
asm!(
    "mov {}, gs:[0x60]",
    out(reg) peb,
);
```

Windowsにおいて、現在の実行中スレッド情報(TIBとかTEBって言ったりする)の`0x60`にPEBが入っているのです。32bitではfsセグメントレジスタの`0x30`です。豆知識。

TEBって何？PEBって何？とかは、詳細はこちら:

[Win32 Thread Information Block](https://en.wikipedia.org/wiki/Win32_Thread_Information_Block)

[Process Environment Block](https://en.wikipedia.org/wiki/Process_Environment_Block#:~:text=In%20computing%20the%20Process%20Environment,other%20than%20the%20operating%20system.)


#### `asm!`マクロを使って、スタックを16バイト前にアラインメント

これは[x64 での呼び出し規則](https://docs.microsoft.com/ja-jp/cpp/build/x64-calling-convention?view=msvc-160)に書いてあります。

16バイトのアラインメントしないとcrashするらしい。

#### 2で取得した関数を使用して、`user32.dll`をロード、 同じく必要な関数のアドレスを取得

ここでは2で取得してきた`LoadLibraryA`というDLLをロードするための関数を使用して`user32.dll`をロードしています。

豆知識として、`kernel32.dll`や`ntdll.dll`は全てのプロセスで同じ場所にロードされる仕組みになっていますが、`user32.dll`はそうではありません。

で、`GetProcAddress`で`MessageBoxA`やらを取得しています。

#### 4で取得した`OutputDebugStringA`や`MessageBoxA`を実際に呼び出す

そのまま。4で取ってきた関数を実際にコールするだけ。

#### `loop {}` <- ???

これがわからない。俺たちは雰囲気でRustを書いている。(誰か知っていたら教えての意味)

---

shellcodeの本体自体はこれで終わりです。じゃあ`shellcode/`ではないこのリポジトリのmainは何をしているのかというと、

`shellcode/`でビルドされた`exe`から`.text`セクションのみを切り取り、その切り取ったバイナリの最初の5bytesを弄ってエントリ関数に`jmp`するパッチを当てているようです。

```rust
fn main() -> Result<()> {
    let src_path = "shellcode\\target\\x86_64-pc-windows-msvc\\release\\shellcode.exe";
    let mut file = File::open(src_path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;
    let pe = PE::parse(&mut buffer)?;
    let standard_fileds = pe.header.optional_header.unwrap().standard_fields;
    let entry_offset = standard_fileds.address_of_entry_point - standard_fileds.base_of_code;
    for section in pe.sections {
        let name = String::from_utf8(section.name.to_vec())?;
        if !name.starts_with(".text") {
            continue;
        }
        let start = section.pointer_to_raw_data as usize;
        let size = section.size_of_raw_data as usize;
        let dst_path = "shellcode\\target\\x86_64-pc-windows-msvc\\release\\shellcode.bin";
        let shellcode = File::create(dst_path)?;
        let mut buf_writer = BufWriter::new(shellcode);
        println!("[*] section text addr: 0x{:x}, size: 0x{:x}", start, size);
        println!("[*] entry offset: 0x{:x}", entry_offset);
        println!("== before patch ==");
        show_disassemble(&buffer[start..start + size], 5);
        if entry_offset >= 0x100 {
            buffer[0 + start] = 0xe9;
            let hi = (entry_offset - 2) / 0x100;
            let li = (entry_offset - 2) % 0x100;
            dbg!(hi, li);
            buffer[1 + start] = li as _;
            buffer[2 + start] = hi as _;
            buffer[3 + start] = 0 as _;
            buffer[4 + start] = 0 as _;
        } else if entry_offset >= 0x80 {
            buffer[0 + start] = 0xe9;
            buffer[1 + start] = (entry_offset - 5) as _;
            buffer[2 + start] = 0 as _;
            buffer[3 + start] = 0 as _;
            buffer[4 + start] = 0 as _;
        } else {
            buffer[0 + start] = 0xeb;
            buffer[1 + start] = (entry_offset - 2) as _;
        }
        println!("== after patch ==");
        show_disassemble(&buffer[start..start + size], 5);
        for i in start..start + size {
            buf_writer.write(&[buffer[i]])?;
        }
        buf_writer.flush().unwrap();
        println!("done! shellcode saved in {}", dst_path);
    }
    Ok(())
}
```

手元で遊んでみましたが、最初の5bytes弄っていいのかな...ってのと、いろいろ弄ってたらパッチが間違ったアドレスになっていたりしたので、次のようにして修正してみました。

```rust
// ...
/*
if entry_offset >= 0x100 {
    buffer[0 + start] = 0xe9;
    let hi = (entry_offset - 2) / 0x100;
    let li = (entry_offset - 2) % 0x100;
    dbg!(hi, li);
    buffer[1 + start] = li as _;
    buffer[2 + start] = hi as _;
    buffer[3 + start] = 0 as _;
    buffer[4 + start] = 0 as _;
} else if entry_offset >= 0x80 {
    buffer[0 + start] = 0xe9;
    buffer[1 + start] = (entry_offset - 5) as _;
    buffer[2 + start] = 0 as _;
    buffer[3 + start] = 0 as _;
    buffer[4 + start] = 0 as _;
} else {
    buffer[0 + start] = 0xeb;
    buffer[1 + start] = (entry_offset - 2) as _;
}
*/
println!("== after patch ==");
show_disassemble(&buffer[start..start + size], 5);
buf_writer.write(&[0xe9])?;
buf_writer.write(&[((entry_offset >> 0) & 0xFF) as _])?;
buf_writer.write(&[((entry_offset >> 8) & 0xFF) as _])?;
buf_writer.write(&[((entry_offset >> 16) & 0xFF) as _])?;
buf_writer.write(&[((entry_offset >> 24) & 0xFF) as _])?;
for i in start..start + size {
    buf_writer.write(&[buffer[i]])?;
}
// ...
```

これで壊れなくなるはずです。

後は`cd shellcode; cargo build --release`としてshellcode本体をビルドし、戻ってきて`cargo run`でパッチしてから`shellcode.exe`と同じ場所に`shellcode.bin`が生成されます。

shellcodeを実際に走らせるためにはメモリ確保やらをしなきゃいけないので、ちょっと面倒です。ここでは私が作った小さなライブラリの中にあるshellcode runner関数を使用します。

`maidsim`というライブラリで、こいつにはshellcode runnerと簡単なdisassemble結果出力関数のみが含まれています。

```rust
// Cargo.toml
// [dependencies]
// maidism = { git = "https://github.com/2vg/blackcat-rs", package = "maidism" }

use anyhow::*;
use maidism::*;

fn main() -> Result<()> {
    let path = r"shellcode\target\x86_64-pc-windows-msvc\release\shellcode.bin";
    // file path, suspend?, timeout
    shellcode_runner(path, false, 0)?;
    Ok(())
}
```

これを`cargo run`すると、メッセージボックスが出てきました。

Rustがshellcodeになった！やったー！

## Rustでshellcodeに出来るRDIを書く
