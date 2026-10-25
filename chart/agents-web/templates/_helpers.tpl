{{- define "agents-web.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "agents-web.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "agents-web.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "agents-web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agents-web.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "agents-web.labels" -}}
helm.sh/chart: {{ include "agents-web.chart" . }}
{{ include "agents-web.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* imagePullSecrets from values plus global, deduplicated by name, rendered as a list or nothing. */}}
{{- define "agents-web.imagePullSecrets" -}}
{{- $g := ((.Values.global | default dict).imagePullSecrets) | default list }}
{{- $seen := dict }}
{{- $all := list }}
{{- range concat ($.Values.imagePullSecrets | default list) $g }}
{{- if not (hasKey $seen .name) }}
{{- $_ := set $seen .name true }}
{{- $all = append $all . }}
{{- end }}
{{- end }}
{{- if $all }}
imagePullSecrets:
  {{- toYaml $all | nindent 2 }}
{{- end }}
{{- end }}

{{/* config.json body; fails naming the offending backends entry. */}}
{{- define "agents-web.configJson" -}}
{{- $seen := dict }}
{{- range $i, $b := .Values.backends }}
{{- $at := printf "backends[%d]" $i }}
{{- if not (kindIs "map" $b) }}{{ fail (printf "%s must be a map with id, label and basePath" $at) }}{{ end }}
{{- if not (and (kindIs "string" $b.id) (regexMatch "^[a-z][a-z0-9-]*$" $b.id)) }}{{ fail (printf "%s.id must match ^[a-z][a-z0-9-]*$" $at) }}{{ end }}
{{- if hasKey $seen $b.id }}{{ fail (printf "%s.id %q is repeated" $at $b.id) }}{{ end }}
{{- if not (and (kindIs "string" $b.label) $b.label) }}{{ fail (printf "%s.label must be a non-empty string" $at) }}{{ end }}
{{- if not (and (kindIs "string" $b.basePath) (hasPrefix "/" $b.basePath)) }}{{ fail (printf "%s.basePath must start with \"/\", not end with \"/\" and contain none of \"//\", \"://\", \"?\", \"#\"" $at) }}{{ end }}
{{- if or (hasSuffix "/" $b.basePath) (contains "//" $b.basePath) (contains "://" $b.basePath) (contains "?" $b.basePath) (contains "#" $b.basePath) }}{{ fail (printf "%s.basePath must start with \"/\", not end with \"/\" and contain none of \"//\", \"://\", \"?\", \"#\"" $at) }}{{ end }}
{{- $_ := set $seen $b.id true }}
{{- end }}
{{- if not (hasKey $seen "orchestrator") }}{{ fail "backends must include id \"orchestrator\"" }}{{ end }}
{{- dict "backends" .Values.backends | toJson }}
{{- end }}
