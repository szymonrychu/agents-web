/** Per-type sample webhook payloads used to prefill the template preview. */
export const TYPES: { value: string; label: string }[] = [
  { value: 'github-pr', label: 'GitHub PR' },
  { value: 'github-issue', label: 'GitHub issue' },
  { value: 'gitlab-mr', label: 'GitLab MR' },
  { value: 'gitlab-issue', label: 'GitLab issue' },
  { value: 'grafana-alert', label: 'Grafana alert' },
]

const github = (key: 'pull_request' | 'issue', title: string) => ({
  action: 'opened',
  repository: { full_name: 'acme/app' },
  [key]: { number: 7, title, body: 'Details of the change.', html_url: `https://github.com/acme/app/${key === 'issue' ? 'issues' : 'pull'}/7`, user: { login: 'alice' } },
  sender: { login: 'alice' },
})
const gitlab = (kind: 'merge_request' | 'issue', title: string) => ({
  object_kind: kind,
  project: { path_with_namespace: 'acme/app' },
  user: { username: 'alice' },
  object_attributes: { iid: 7, title, description: 'Details of the change.', action: 'open', url: `https://gitlab.com/acme/app/-/${kind === 'issue' ? 'issues' : 'merge_requests'}/7` },
})

const SAMPLES: Record<string, unknown> = {
  'github-pr': github('pull_request', 'Add retry to the client'),
  'github-issue': github('issue', 'Crash on empty input'),
  'gitlab-mr': gitlab('merge_request', 'Add retry to the client'),
  'gitlab-issue': gitlab('issue', 'Crash on empty input'),
  'grafana-alert': {
    status: 'firing',
    title: '[FIRING:1] HighErrorRate',
    message: 'Error rate above 5%',
    commonLabels: { alertname: 'HighErrorRate', severity: 'critical' },
    alerts: [{ status: 'firing', labels: { alertname: 'HighErrorRate' }, generatorURL: 'https://grafana.example/alerting/1' }],
  },
}

export const sampleFor = (type: string): string => JSON.stringify(SAMPLES[type] ?? {}, null, 2)
