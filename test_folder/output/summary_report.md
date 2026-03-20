# Data Analysis Summary Report

## Executive Summary

This report presents a comprehensive analysis of a loan dataset containing **3,000 records** with **21 variables** covering borrower demographics, financial metrics, and loan performance. The analysis reveals three significant patterns that predict loan repayment behavior.

---

## 1. Data Overview

### Dataset Characteristics
- **Total Records**: 3,000 loan applications
- **Total Variables**: 21 columns
- **Data Types**: 14 numerical, 7 categorical
- **Missing Values**: None (100% complete data)

### Key Variables Analyzed
| Category | Variables |
|----------|-----------|
| Demographics | age, gender, marital_status, education_level |
| Financial | annual_income, monthly_income, debt_to_income_ratio, credit_score |
| Loan Details | loan_amount, loan_purpose, interest_rate, loan_term, installment |
| Credit History | num_of_open_accounts, total_credit_limit, current_balance, delinquency_history, num_of_delinquencies |
| Outcome | loan_paid_back |

---

## 2. Data Quality Report

### 2.1 Missing Values
**Status**: ✅ No missing values detected in any column.

### 2.2 Outlier Analysis (IQR Method)
Outliers were detected in several numerical columns:

| Column | Outlier Count | Percentage | Notes |
|--------|---------------|------------|-------|
| current_balance | 163 | 5.43% | High balance outliers |
| total_credit_limit | 149 | 4.97% | High credit limit outliers |
| annual_income | 132 | 4.40% | High income outliers |
| monthly_income | 132 | 4.40% | High income outliers |
| num_of_open_accounts | 61 | 2.03% | Many open accounts |
| num_of_delinquencies | 53 | 1.77% | Multiple delinquencies |
| debt_to_income_ratio | 36 | 1.20% | High DTI ratios |
| loan_paid_back | 587 | 19.57% | Binary variable (expected) |

**Note**: Outliers in financial columns (income, credit limits) may represent legitimate high-value customers and should be reviewed on a case-by-case basis.

### 2.3 Data Inconsistencies
**Status**: ✅ No data inconsistencies detected.
- All age values within valid range (21-75)
- Credit scores within standard range (445-850)
- Interest rates within reasonable bounds (4.65%-20.22%)
- No negative values in any positive-only fields

### 2.4 Privacy & Quality Concerns
- **Data appears to be synthetic/test data** - No PII detected, but source should be verified
- **Binary outcome variable (loan_paid_back)** - 80.43% repayment rate observed
- **Potential selection bias** - Dataset may not represent all loan applicants

---

## 3. Descriptive Statistics

### Key Metrics Summary

| Metric | Mean | Median | Std Dev | Min | Max |
|--------|------|--------|---------|-----|-----|
| Age | 48.48 | 49.00 | 15.69 | 21 | 75 |
| Annual Income | $43,345 | $36,177 | $28,023 | $6,000 | $229,763 |
| Credit Score | 680.97 | 680.00 | 69.66 | 445 | 850 |
| Loan Amount | $15,094 | $14,787 | $8,666 | $500 | $49,040 |
| Interest Rate | 12.40% | 12.51% | 2.41% | 4.65% | 20.22% |
| Debt-to-Income | 0.18 | 0.17 | 0.11 | 0.01 | 0.59 |

---

## 4. Top 3 Patterns and Trends

### Pattern 1: Credit Score Strongly Predicts Loan Repayment ✅
**Statistical Significance**: r = 0.184, p < 0.001

| Credit Score Range | Repayment Rate | Sample Size |
|-------------------|----------------|-------------|
| Poor (0-580) | 70.83% | 216 |
| Fair (581-670) | 74.29% | 1,124 |
| Good (671-740) | 81.36% | 1,057 |
| Very Good (741-800) | 93.07% | 462 |
| Excellent (801-850) | 95.74% | 141 |

**Insight**: Borrowers with excellent credit scores are **25 percentage points** more likely to repay their loans compared to those with poor credit.

---

### Pattern 2: Employment Status is a Major Factor ✅
**Statistical Significance**: Highly significant variation

| Employment Status | Repayment Rate | Avg Credit Score |
|-----------------|----------------|-------------------|
| Retired | 99.0% | 674 |
| Self-employed | 91.0% | 685 |
| Employed | 88.0% | 680 |
| Student | 44.0% | 690 |
| Unemployed | 19.0% | 682 |

**Insight**: Retired individuals show the highest repayment rate (99%), while unemployed borrowers have the lowest (19%). Students also show concerning repayment rates (44%).

---

### Pattern 3: Debt-to-Income Ratio Negatively Impacts Repayment ✅
**Statistical Significance**: r = -0.228, p < 0.001 (strongest predictor)

| DTI Ratio | Repayment Rate |
|-----------|----------------|
| 0-10% | 89.96% |
| 10-20% | 82.63% |
| 20-30% | 76.13% |
| 30-40% | 68.75% |
| >40% | 53.17% |

**Insight**: Borrowers with DTI ratios above 40% are only half as likely to repay compared to those with DTI below 10%.

---

## 5. Key Finding Visualization

A comprehensive visualization has been saved to `output/key_finding.png`, showing:
1. Loan repayment rate by credit score category
2. Credit score distribution by repayment status
3. Repayment rate by debt-to-income ratio
4. Repayment rate by employment status

---

## 6. Limitations and Confidence Notes

### Data Limitations
1. **Synthetic Data**: The dataset appears to be synthetic; results may not generalize to real-world scenarios
2. **Sample Size**: While 3,000 records is adequate for general patterns, some subgroups (e.g., "Excellent" credit) have limited samples
3. **Temporal Context**: No date information provided; cannot assess temporal trends
4. **Causality**: Correlations observed do not imply causation

### Confidence Notes
- **High Confidence**: Credit score and DTI correlations are statistically significant (p < 0.001)
- **Medium Confidence**: Employment status patterns are significant but may conflate with age/retirement status
- **Low Confidence**: Income shows no significant correlation with repayment (r = 0.003, p = 0.87)

### Recommendations
1. **Risk Assessment**: Prioritize credit score and DTI ratio in loan approval decisions
2. **Employment Verification**: Implement additional safeguards for unemployed/student applicants
3. **Further Analysis**: Conduct longitudinal analysis if temporal data becomes available

---

## 7. Methodology

- **Outlier Detection**: Interquartile Range (IQR) method with 1.5× threshold
- **Statistical Tests**: Pearson correlation, Point-biserial correlation
- **Significance Level**: α = 0.05
- **Software**: Python (pandas, numpy, scipy, matplotlib)

---

*Report generated on: Analysis Date*  
*Data source: 32130_2026A_10(in).csv*
