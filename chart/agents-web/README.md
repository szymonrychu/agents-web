# agents-web chart

Static UI (nginx) with a runtime `config.json` and an optional Ingress on `/`.

## Values

| Value | Default | Meaning |
|---|---|---|
| `image.repository` / `image.tag` / `image.pullPolicy` | harbor image / required / `IfNotPresent` | Image; the render fails while `tag` is empty |
| `imagePullSecrets` | `[]` | Merged with `global.imagePullSecrets` |
| `replicaCount` | `1` | Replicas |
| `podAnnotations`, `podSecurityContext`, `securityContext`, `resources` | hardened defaults | Pod settings |
| `livenessProbe`, `readinessProbe` | `GET /healthz :8080` | Probes |
| `service.type` / `service.port` | `ClusterIP` / `8080` | Service |
| `backends` | `[{id: orchestrator, label: Orchestrator, basePath: /api/v1}]` | Rendered as `{"backends": [...]}` into `<fullname>-config`, mounted at `/usr/share/nginx/html/config.json`. Each entry needs `id`, `label`, `basePath` (starting with `/`); one must have id `orchestrator`. The render fails naming the entry otherwise. A change rolls the pod (`checksum/config`). |
| `ingress.enabled` | `false` | Render the Ingress |
| `ingress.className` | `""` | Ingress class |
| `ingress.annotations` | `{}` | Extra annotations (cert-manager, oauth2-proxy, ...) |
| `ingress.denySourceRanges` | `[]` | CIDRs for `nginx.ingress.kubernetes.io/denylist-source-range` |
| `ingress.allowSourceRanges` | `[]` | CIDRs for `nginx.ingress.kubernetes.io/whitelist-source-range` |
| `ingress.hosts[].host` / `.paths[]` | `chart-example.local`, `/` Prefix | Rules to this Service's port |
| `ingress.tls` | `[]` | TLS entries |

`helm test` runs a pod that GETs `/healthz` and `/config.json` on the Service.

## URL layout

Contract `agents-web-url-layout`: all services share one host.

- The UI (this chart) owns `/`.
- agent-orchestrator owns `/api`.
- Each later service owns exactly one prefix `/<prefix>/`, with its UI-facing API at `/<prefix>/api/v1`. The prefixes `webhooks` and `schedules` are reserved.
- Only one Ingress of the host carries the cert-manager annotations; the others reference the same TLS secret.

Add a service to the UI by adding a `backends` entry whose `basePath` is its `/<prefix>/api/v1`.
