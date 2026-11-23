# boom-doc

Playwrightテストから画像付きの操作マニュアルをMarkdownで生成します。編集した本文に次回の変更を反映し、HTML・PDF・Wordに出力できます。

## 導入

Node.js 24以降、Go 1.22以降、GitをPATHに用意します。ソースを取得したboom-docディレクトリで配布ファイルを作成します。

```sh
npm ci
npm pack
```

利用するPlaywrightプロジェクトで、作成したファイルをインストールします。

```sh
npm install -D ../boom-doc/boom-doc-0.1.0.tgz
npx playwright install chromium
```

ES Modulesのテストプロジェクト（package.json に `"type": "module"`）で、テストを次のように記述します。各操作の完了後に画面を撮影します。

```ts
import { test } from 'boom-doc/fixture';

test('設定の保存', async ({ page, manualStep }) => {
  await page.setContent('<button>保存</button>');
  await manualStep('保存をクリックします。', () =>
    page.getByRole('button', { name: '保存' }).click()
  );
});
```

## 生成と更新

```sh
npx boom-doc generate playwright.config.ts ./manual
```

章はテスト開始順です。順序を指定する場合は、第3引数にテスト名を順番に並べたJSON配列のファイルを渡します。
生成された `manual/manual.md` を編集し、画像の `assets/` と比較用の `.boom-base.md` を一緒に管理します。同じコマンドを再実行すると差分を反映します。手動編集と自動更新を統合できない場合はエラーで終了します。出力先ごとに一度に1回ずつ実行してください。

### 画像と差分の扱い

各手順の操作が終わった時点で撮影し、PNGのSHA-256をファイル名として `assets/` に保存します。同じ内容の画像は共有します。画像の計算は並列ですが、本文の手順は記録順です。章の開始時刻が同じ場合は章名順になります。明示的に並べる場合は、記録対象のテスト名を重複なくすべて順序ファイルに列挙してください。

前回の生成文は `.boom-base.md`、利用者が編集する本文は `manual.md` です。末尾の追記は新しい生成文に引き継ぎ、それ以外の編集は前回の生成文を基準に統合します。競合した場合や一方のファイルだけが欠けている場合は、本文を上書きせずに終了します。

## 配布用ファイルの出力

```sh
npx boom-doc export manual/manual.md manual/guide.html
npx boom-doc export manual/manual.md manual/guide.pdf
npx boom-doc export manual/manual.md manual/guide.docx
```

変換時に埋め込める画像は生成されたPNGです。PDF出力にMicrosoft Edgeを使う場合は環境変数 `BOOM_BROWSER_CHANNEL` を `msedge` に設定します。

## 開発・ライセンス

GitHub Flowを採用します。最新の `main` から変更ごとに作業ブランチを作り、`main` 宛てのプルリクエストでCIの成功を確認してマージします。マージ後は作業ブランチを削除します。

ブランチ名は `<種類>/<変更内容>` とし、変更内容は英小文字と数字を使い、単語をハイフンで区切ります。種類は変更の主目的で選びます。

| 種類 | 用途 | 例 |
|---|---|---|
| `feat` | 機能追加 | `feat/parallel-image-hashing` |
| `fix` | 不具合修正 | `fix/preserve-manual-notes` |
| `docs` | ドキュメント | `docs/branch-naming` |
| `test` | テストの追加・修正 | `test/chapter-order` |
| `refactor` | 動作を保つ実装修正 | `refactor/markdown-merge` |
| `chore` | 依存関係・CI・リリース準備 | `chore/update-playwright` |

boom-docディレクトリで `npm ci`、`npx playwright install chromium`、`npm test` を順に実行すると、配布ファイルを別プロジェクトに導入して生成・更新・出力を検証します。

[MIT License](LICENSE)
