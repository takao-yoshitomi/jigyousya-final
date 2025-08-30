# Supabase安全移行ガイド

## 🎯 目標
既存Supabaseデータを保持しながらFlask版互換にする

## 📋 現状分析
- **ID型**: UUID（Supabaseデフォルト）← そのまま利用
- **default_tasks**: 旧構造 → Flask版構造に調整必要
- **clients**: 経理方式が`法人税法/所得税法` → `記帳代行/自計`に変更必要

## 🚀 段階的移行手順

### ステップ1: バックアップ作成（推奨）
```sql
-- 重要なテーブルをバックアップ
CREATE TABLE backup_default_tasks AS SELECT * FROM default_tasks;
CREATE TABLE backup_clients AS SELECT * FROM clients;  
CREATE TABLE backup_monthly_tasks AS SELECT * FROM monthly_tasks;
```

### ステップ2: 構造調整
```sql
-- supabase-safe-update.sqlを実行
```

### ステップ3: データ確認
以下を確認：
1. `default_tasks`に新しい経理方式データが作成されたか
2. `clients`の`accounting_method`が正しく更新されたか
3. `monthly_tasks`の項目名が新しい形式になったか

### ステップ4: 動作テスト
- Supabaseクライアントから新しいデータ構造でアクセス
- 経理方式による初期項目の自動設定をテスト

## ⚠️ 注意点
- **UUID型はそのまま**: JavaScript側でUUIDとして扱う
- **段階的実行**: 一度に全て変更せず確認しながら進める
- **rollback準備**: 問題があればバックアップから復元

## 🔧 JavaScript側の調整
```javascript
// UUID対応の例
const clientId = crypto.randomUUID(); // INTEGER IDの代わり
```

## 📊 期待される結果
- 経理方式: `記帳代行` → 受付・入力完了・担当チェック・不明投げかけ・月次完了
- 経理方式: `自計` → データ受領・担当チェック・不明投げかけ・月次完了
- 既存データ保持: スタッフ・クライアント情報そのまま