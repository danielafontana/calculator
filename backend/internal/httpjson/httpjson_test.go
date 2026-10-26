package httpjson_test

import (
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/danielafontana/calculator/backend/internal/httpjson"
	"github.com/danielafontana/calculator/backend/internal/models"
)

func TestWrite(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	httpjson.Write(rec, http.StatusCreated, map[string]int{"n": 1})

	assert.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	assert.JSONEq(t, `{"n":1}`, rec.Body.String())
}

func TestWrite_EncodeFailureKeepsStatus(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	httpjson.Write(rec, http.StatusOK, math.NaN()) // NaN is not valid JSON

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Empty(t, rec.Body.String())
}

func TestError(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	httpjson.Error(rec, http.StatusBadRequest, models.CodeDivisionByZero, "division by zero")

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.JSONEq(t, `{"error":"division by zero","code":"DIVISION_BY_ZERO"}`, rec.Body.String())
}
