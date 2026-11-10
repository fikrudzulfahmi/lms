<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Services\GradeCalculationService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GradeController extends Controller
{
    public function __construct(private readonly GradeCalculationService $grades) {}

    public function index(Request $request): Response
    {
        $student = $request->user();
        $yearId = $request->integer('year') ?: null;

        $report = $this->grades->studentReport($student, $yearId);
        $activeYear = AcademicYear::active();

        return Inertia::render('Student/Grades/Index', [
            'report' => $report,
            'active_year' => $activeYear?->only(['id', 'name', 'semester']),
        ]);
    }
}
