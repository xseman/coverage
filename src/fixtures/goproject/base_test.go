package fixture

import "testing"

// Base tests: covers Add, Divide, Reverse, PadLeft
// Does NOT cover: Subtract, Multiply, Modulo, Capitalize, Truncate

func TestAddBase(t *testing.T) {
	if Add(1, 2) != 3 {
		t.Fatal("expected 3")
	}
}

func TestDivideBase(t *testing.T) {
	result, err := Divide(10, 2)
	if err != nil {
		t.Fatal(err)
	}
	if result != 5 {
		t.Fatal("expected 5")
	}
}

func TestReverseBase(t *testing.T) {
	if Reverse("abc") != "cba" {
		t.Fatal("expected cba")
	}
}

func TestPadLeftBase(t *testing.T) {
	if PadLeft("hi", 5, '*') != "***hi" {
		t.Fatal("expected ***hi")
	}
}
