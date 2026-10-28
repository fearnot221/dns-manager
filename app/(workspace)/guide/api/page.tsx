import { requireActor } from "@/lib/auth/session";
import { openApiDocument } from "@/lib/openapi/document";
import { PageHeader } from "@/components/ui";
import "@/styles/api-docs.css";

export const metadata = { title: "API 文件" };

export default async function ApiDocsPage() {
  await requireActor();
  const operations = Object.entries(openApiDocument.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({ path, method, operation })));
  return <div className="content api-docs">
    <PageHeader title="API 文件" description={`OpenAPI ${openApiDocument.openapi} · ${operations.length} 個操作（含已停用端點與 Auth.js 協定）。`} actions={<a className="button" href="/api/openapi" download="openapi.json">下載 OpenAPI JSON</a>} />
    <section className="card api-docs-intro" aria-labelledby="api-auth-heading">
      <h2 id="api-auth-heading">驗證與呼叫方式</h2>
      <p>{openApiDocument.info.description}</p>
      <p>各操作下方列出存取條件與 OpenAPI 定義；<code>$ref</code> 對應頁末的資料結構。可使用瀏覽器「尋找」搜尋路徑或欄位。</p>
      <nav aria-label="API 分類">{openApiDocument.tags.map(tag => <a key={tag.name} href={`#api-${tag.name}`}>{tag.name}</a>)}<a href="#api-schemas">資料結構</a></nav>
    </section>
    {openApiDocument.tags.map(tag => <section key={tag.name} aria-labelledby={`api-${tag.name}`}>
      <h2 id={`api-${tag.name}`}>{tag.name}</h2>
      {operations.filter(({ operation }) => operation.tags.includes(tag.name)).map(({ path, method, operation }) => <details className="card api-operation" key={operation.operationId}>
        <summary><code>{method.toUpperCase()}</code><span>{path}</span><span>{operation.summary}{operation.deprecated ? "（410）" : ""}</span></summary>
        <div><p>{operation.description}</p><p><strong>存取條件：</strong>{operation["x-access"]}</p><pre aria-label={`${method.toUpperCase()} ${path} OpenAPI 定義`}><code>{JSON.stringify(operation, null, 2)}</code></pre></div>
      </details>)}
    </section>)}
    <section aria-labelledby="api-schemas"><h2 id="api-schemas">資料結構</h2>{Object.entries(openApiDocument.components.schemas).map(([name, schema]) => <details className="card api-operation" key={name}><summary><code>{name}</code></summary><pre aria-label={`${name} schema`}><code>{JSON.stringify(schema, null, 2)}</code></pre></details>)}</section>
  </div>;
}
