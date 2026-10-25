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

{{/* imagePullSecrets from values plus global, rendered as a list or nothing. */}}
{{- define "agents-web.imagePullSecrets" -}}
{{- $g := ((.Values.global | default dict).imagePullSecrets) | default list }}
{{- $all := concat ($.Values.imagePullSecrets | default list) $g }}
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
{{- if not $b.id }}{{ fail (printf "%s: id is required" $at) }}{{ end }}
{{- if not $b.label }}{{ fail (printf "%s (%s): label is required" $at $b.id) }}{{ end }}
{{- if not $b.basePath }}{{ fail (printf "%s (%s): basePath is required" $at $b.id) }}{{ end }}
{{- if not (hasPrefix "/" $b.basePath) }}{{ fail (printf "%s (%s): basePath %q must start with \"/\"" $at $b.id $b.basePath) }}{{ end }}
{{- $_ := set $seen $b.id true }}
{{- end }}
{{- if not (hasKey $seen "orchestrator") }}{{ fail "backends must include an entry with id \"orchestrator\"" }}{{ end }}
{{- dict "backends" .Values.backends | toJson }}
{{- end }}
