# workout-local-app

## 起動とオフライン利用

Service Workerを使うため、`index.html`を直接開くのではなく、HTTPSで公開するかローカルWebサーバー経由で開いてください。GitHub PagesではHTTPSのURLを使います。

ローカルで確認する場合は、このフォルダーで次のコマンドを実行し、ブラウザーで `http://localhost:8000` を開きます。

```sh
python3 -m http.server 8000
```

初回はオンラインでページを開き、Service Workerの登録とキャッシュが完了してから再読み込みしてください。その後はオフラインでもアプリを起動できます。iPhoneではSafariの共有メニューから「ホーム画面に追加」、AndroidではChromeのメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。表示される項目はOSやブラウザーのバージョンによって異なります。

種目データは従来どおりブラウザーのlocalStorageに保存されます。ファイルからHTTPSサイトやlocalhostへ移行すると保存場所（オリジン）が変わるため、移行前にアプリの「JSONを書き出す」を使い、新しいURLで「JSONを読み込む」から復元してください。