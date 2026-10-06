from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictInt


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    schema_version: Literal['1.0'] = '1.0'


class Canvas(StrictModel):
    width: int = Field(default=1080, gt=0, le=4096)
    height: int = Field(default=1440, gt=0, le=4096)


class Asset(StrictModel):
    asset_id: str
    path: str
    mime_type: Literal['image/png', 'image/jpeg']
    width: int
    height: int
    required: bool = True
    role: str
    fit_policy: Literal['contain', 'cover_or_contain']
    crop_allowed: bool
    license: str
    redistribution: bool = False


class PublicTask(StrictModel):
    task_id: str
    canvas: Canvas
    source_files: list[str]
    brief_file: str = 'brief.md'
    asset_manifest: str = 'assets.json'
    required_fields: list[str]
    minimum_font_px: dict[str, int]
    style_requirements: list[str]
    verbatim_fields: list[str]
    output_contract_version: Literal['html-v1'] = 'html-v1'
    brief: str = ''
    sources: dict[str, str] = Field(default_factory=dict)
    assets: list[Asset] = Field(default_factory=list)


class FieldAnswer(StrictModel):
    value: str
    match: Literal['normalized_exact', 'allowed_forms'] = 'normalized_exact'
    allowed_forms: list[str] = Field(default_factory=list)
    case_sensitive: bool = True


class SourceReview(StrictModel):
    reviewer_a: str = ''
    reviewer_b: str = ''
    confirmed: bool = False


class AnswerSpec(StrictModel):
    task_id: str
    fields: dict[str, FieldAnswer]
    forbidden_stale_dates: list[str] = Field(default_factory=list)
    critical_fields: list[str]
    source_review: SourceReview


class TaskMetadata(StrictModel):
    task_id: str
    event_id: str
    variant: Literal['standard', 'date_update', 'long_text']
    split: Literal['dev', 'test']
    public_dir: str
    answer_path: str
    public_sha256: str
    answer_sha256: str
    source_url: str
    changed_fields: list[str] = Field(default_factory=list)


class ImageInput(StrictModel):
    path: str
    mime_type: str
    sha256: str
    label: str


class ModelRequest(StrictModel):
    role: Literal['executor', 'judge']
    logical_call_id: str
    purpose: str
    system: str
    text: str
    images: list[ImageInput] = Field(default_factory=list)


class ModelResponse(StrictModel):
    response_id: str | None = None
    text: str
    stop_reason: str | None = None
    usage: dict = Field(default_factory=dict)
    latency_seconds: float | None = None
    model: str
    truncated: bool = False


class RenderReport(StrictModel):
    render_status: Literal['rendered', 'render_failed']
    png_path: str | None = None
    width: int | None = None
    height: int | None = None
    geometry: dict = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    blocked_requests: list[str] = Field(default_factory=list)
    duration_seconds: float = 0
    browser_version: str | None = None


class CheckResult(StrictModel):
    check_id: str
    stage: Literal['draft', 'revised']
    status: Literal['pass', 'fail', 'unknown', 'not_applicable']
    critical: bool = True
    evidence: dict = Field(default_factory=dict)
    checker_version: str = 'rules-v1'


class FieldJudgment(StrictModel):
    field_id: str
    observed_text: str
    correctness: Literal['correct', 'incorrect', 'missing', 'unknown']
    visibility: Literal['readable', 'unreadable', 'missing', 'unknown']
    evidence: str = Field(min_length=1)


class VisualScore(StrictModel):
    score: StrictInt | None = Field(ge=1, le=5)
    evidence: str = Field(min_length=1)


class VisualScores(StrictModel):
    readability: VisualScore
    hierarchy: VisualScore
    layout: VisualScore
    style: VisualScore


class MajorIssue(StrictModel):
    category: str
    field_id: str | None = None
    evidence: str = Field(min_length=1)


class JudgeReport(StrictModel):
    artifact_id: str
    fields: list[FieldJudgment]
    visual_scores: VisualScores
    major_issues: list[MajorIssue]


class StageArtifact(StrictModel):
    status: Literal['not_created', 'contract_failed', 'render_failed', 'rendered'] = 'not_created'
    html: str | None = None
    png: str | None = None
    error: str | None = None


class Operation(StrictModel):
    status: Literal['pending', 'running', 'complete', 'failed', 'interrupted', 'unknown_remote_state'] = 'pending'
    logical_call_id: str | None = None
    error: str | None = None


class RunRecord(StrictModel):
    purpose: Literal['benchmark', 'personal'] = 'benchmark'
    run_id: str
    task_id: str
    mode: Literal['demo', 'dev', 'test']
    experiment_id: str | None = None
    created_at: str
    status: str = 'created'
    config_sha256: str
    prompt_sha256: str
    public_task_sha256: str
    operations: dict[str, Operation]
    artifacts: dict[str, StageArtifact]
