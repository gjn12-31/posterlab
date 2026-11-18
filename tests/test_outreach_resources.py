from posterlab.outreach_resources import release_links


def test_offers_concrete_actions_from_the_authors_release_sentence_only():
    abstract = (
        "We compare against a baseline implementation at https://example.org/old. "
        "We release a package for the method and provide our code and checkpoints at https://github.com/lab/method. "
        "We will release the dataset at https://example.org/future. "
        "Their code is available at https://example.org/another-method."
    )
    assert release_links({"sections": {"abstract": abstract}}) == [
        {"label": "代码与模型权重", "url": "https://github.com/lab/method"}
    ]
    assert release_links({"evidence": ["演示：https://example.org/demo。", "演示：https://example.org/demo。"]}) == [
        {"label": "演示", "url": "https://example.org/demo"}
    ]
    assert release_links({"evidence": [
        "Project page: https://example.com/demo?token=private", "We release code: https://user@example.org/demo",
        "The code is not available at https://example.org/broken.", "The paper is at https://doi.org/10.123/123.",
    ]}) == []
