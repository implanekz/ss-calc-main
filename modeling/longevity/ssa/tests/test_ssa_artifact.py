from fetch_table4c6 import parse_table


def test_parse_table_returns_all_ages_for_both_sexes(ssa_html):
    artifact = parse_table(ssa_html, retrieved_at="2026-08-31")
    assert [row["age"] for row in artifact["data"]["male"]] == list(range(120))
    assert [row["age"] for row in artifact["data"]["female"]] == list(range(120))
    assert all(
        0 <= row["qx"] <= 1
        for sex in ("male", "female")
        for row in artifact["data"][sex]
    )


def test_checksum_covers_only_canonical_data_payload(ssa_html):
    first = parse_table(ssa_html, retrieved_at="2026-08-31")
    second = parse_table(ssa_html, retrieved_at="2026-09-01")
    assert first["checksumSha256"] == second["checksumSha256"]


def test_official_spot_values_match_source(ssa_html):
    artifact = parse_table(ssa_html, retrieved_at="2026-08-31")
    expected_qx = {
        "male": {0: 0.006015, 65: 0.016455, 95: 0.262268, 110: 0.597297, 119: 0.926604},
        "female": {0: 0.005125, 65: 0.010188, 95: 0.216846, 110: 0.597297, 119: 0.926604},
    }
    for sex, values in expected_qx.items():
        for age, qx in values.items():
            assert artifact["data"][sex][age]["qx"] == qx
